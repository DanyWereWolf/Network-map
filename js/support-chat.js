/**
 * Виджет: FAQ-бот и переписка с владельцем (главный администратор).
 */
(function() {
    var VISITOR_KEY = 'networkMap_supportVisitorId';
    var CONTACT_KEY = 'networkMap_supportContact';
    var POLL_BOT_MS = 20000;
    var POLL_OWNER_MS = 5000;
    var panel = null;
    var messagesEl = null;
    var statusDot = null;
    var statusText = null;
    var headerTitle = null;
    var quickWrap = null;
    var fabBadge = null;
    var fabWrap = null;
    var backdropEl = null;
    var mode = 'bot';
    var ownerModeEnabled = true;
    var pollTimer = null;
    var adminOnline = false;
    var hasUnreadAdmin = false;
    var ownerHintShown = false;
    var botWelcomeShown = false;
    var mobileMq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(max-width: 768px)')
        : null;

    function isMobileUi() {
        return mobileMq ? mobileMq.matches : false;
    }

    function syncMobileState(opened) {
        var isOpen = !!opened;
        var mobile = isMobileUi();
        if (document && document.body) {
            document.body.classList.toggle('support-chat-mobile-open', mobile && isOpen);
        }
        if (backdropEl) {
            var showBackdrop = mobile && isOpen;
            backdropEl.hidden = !showBackdrop;
            backdropEl.classList.toggle('is-open', showBackdrop);
            backdropEl.setAttribute('aria-hidden', showBackdrop ? 'false' : 'true');
        }
    }

    function getApiBase() {
        if (typeof window.getApiBase === 'function') {
            try { return window.getApiBase(); } catch (e) {}
        }
        var o = window.location && window.location.origin;
        return (o && (o.indexOf('http://') === 0 || o.indexOf('https://') === 0)) ? o : '';
    }

    function getVisitorId() {
        try {
            var id = localStorage.getItem(VISITOR_KEY);
            if (id && id.length > 8) return id;
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(VISITOR_KEY, id);
            return id;
        } catch (e) {
            return 'v_' + Date.now();
        }
    }

    function getSavedContact() {
        try {
            var raw = localStorage.getItem(CONTACT_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function saveContact(name, email) {
        try {
            localStorage.setItem(CONTACT_KEY, JSON.stringify({
                name: String(name || '').trim(),
                email: String(email || '').trim()
            }));
        } catch (e) {}
    }

    function getSessionUser() {
        try {
            var raw = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function prefillContactFields() {
        var nameEl = document.getElementById('supportChatName');
        var emailEl = document.getElementById('supportChatEmail');
        if (!nameEl || !emailEl) return;
        var saved = getSavedContact();
        var user = getSessionUser();
        if (!nameEl.value && saved.name) nameEl.value = saved.name;
        if (!emailEl.value && saved.email) emailEl.value = saved.email;
        if (!nameEl.value && user) {
            nameEl.value = user.fullName || user.username || '';
        }
        if (!emailEl.value && user && user.contactEmail) {
            emailEl.value = user.contactEmail;
        }
    }

    function formatTime(iso) {
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function scrollMessages() {
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function appendMessage(from, text, at, msgId) {
        if (!messagesEl) return null;
        if (msgId && messagesEl.querySelector('[data-msg-id="' + msgId + '"]')) {
            return messagesEl.querySelector('[data-msg-id="' + msgId + '"]');
        }
        var div = document.createElement('div');
        div.className = 'support-chat-msg ' + (from === 'visitor' ? 'visitor' : from === 'admin' ? 'admin' : from === 'system' ? 'system' : 'bot');
        if (msgId) div.setAttribute('data-msg-id', msgId);
        var label = from === 'admin' ? 'Владелец' : from === 'visitor' ? 'Вы' : from === 'system' ? '' : 'Помощник';
        div.innerHTML = '<div class="support-chat-msg-body">' + escapeHtml(text) + '</div>' +
            (label ? '<div class="support-chat-msg-meta">' + escapeHtml(label) +
            (at ? ' · ' + escapeHtml(formatTime(at)) : '') + '</div>' : '');
        messagesEl.appendChild(div);
        scrollMessages();
        return div;
    }

    function showSystemMessage(text) {
        appendMessage('system', text, new Date().toISOString(), 'sys_' + Date.now());
    }

    function removeMessageById(msgId) {
        if (!messagesEl || !msgId) return;
        var el = messagesEl.querySelector('[data-msg-id="' + msgId + '"]');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function setFabBadge(show) {
        if (!fabBadge) return;
        fabBadge.hidden = !show;
        if (fabWrap) fabWrap.classList.toggle('has-unread', !!show);
    }

    function setPresence(online) {
        adminOnline = !!online;
        if (statusDot) statusDot.classList.toggle('online', adminOnline);
        if (statusText) {
            if (mode === 'owner') {
                statusText.textContent = adminOnline
                    ? 'В сети — ответит в этом чате'
                    : 'Не в сети — ответ появится здесь позже';
            } else {
                statusText.textContent = adminOnline
                    ? 'Владелец в сети — вкладка «Владельцу»'
                    : 'Личное сообщение — вкладка «Владельцу»';
            }
        }
    }

    function fetchPresence() {
        return fetch(getApiBase() + '/api/support/presence', { credentials: 'include' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) { if (data) setPresence(data.online); })
            .catch(function() {});
    }

    function markThreadRead() {
        return fetch(getApiBase() + '/api/support/read', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitorId: getVisitorId() })
        })
            .then(function() {
                hasUnreadAdmin = false;
                setFabBadge(false);
            })
            .catch(function() {});
    }

    function getVisibleMessages(data) {
        if (!data || !Array.isArray(data.messages)) return [];
        if (mode === 'owner') {
            return data.messages.filter(function(m) { return m.from === 'visitor' || m.from === 'admin'; });
        }
        return data.messages;
    }

    function showOwnerEmptyHint() {
        if (ownerHintShown || !messagesEl) return;
        var hasOwnerMsgs = messagesEl.querySelector('.support-chat-msg.admin, .support-chat-msg.visitor[data-msg-id]:not([data-msg-id^="bot_local_"])');
        if (hasOwnerMsgs) return;
        showSystemMessage('Напишите владельцу: предложения, вопросы по лимитам, ошибки или идеи по развитию программы.');
        ownerHintShown = true;
    }

    function syncThread(markRead) {
        return fetch(getApiBase() + '/api/support/thread?visitorId=' + encodeURIComponent(getVisitorId()), {
            credentials: 'include'
        })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data || !messagesEl) return;
                if (data.name || data.email) {
                    var nameEl = document.getElementById('supportChatName');
                    var emailEl = document.getElementById('supportChatEmail');
                    if (nameEl && !nameEl.value && data.name) nameEl.value = data.name;
                    if (emailEl && !emailEl.value && data.email) emailEl.value = data.email;
                }
                var hadUnread = hasUnreadAdmin;
                hasUnreadAdmin = !!data.hasUnreadAdmin;
                if (hasUnreadAdmin && !panel.classList.contains('is-open')) {
                    setFabBadge(true);
                }
                getVisibleMessages(data).forEach(function(m) {
                    if (m.from === 'admin' || m.from === 'visitor') {
                        appendMessage(m.from, m.text, m.at, m.id);
                    }
                });
                if (data.messages.some(function(m) { return m.from === 'admin'; }) && mode === 'bot') {
                    setMode('owner', { skipFocus: true });
                }
                if (mode === 'owner') showOwnerEmptyHint();
                if (markRead && panel.classList.contains('is-open') && mode === 'owner') {
                    return markThreadRead();
                }
                if (hadUnread !== hasUnreadAdmin && panel.classList.contains('is-open') && mode === 'owner' && hasUnreadAdmin) {
                    return markThreadRead();
                }
            })
            .catch(function() {});
    }

    function renderQuickReplies(items) {
        if (!quickWrap) return;
        if (mode === 'owner') {
            quickWrap.hidden = true;
            quickWrap.innerHTML = '';
            return;
        }
        quickWrap.hidden = false;
        quickWrap.innerHTML = '';
        (items || []).forEach(function(q) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = q;
            btn.addEventListener('click', function() {
                var ta = document.getElementById('supportChatInput');
                if (ta) ta.value = q;
                sendBot();
            });
            quickWrap.appendChild(btn);
        });
    }

    function sendBot() {
        var ta = document.getElementById('supportChatInput');
        var text = ta ? String(ta.value || '').trim() : '';
        if (!text) return;
        appendMessage('visitor', text, new Date().toISOString(), 'bot_local_' + Date.now());
        if (ta) ta.value = '';
        var sendBtn = document.getElementById('supportChatSend');
        if (sendBtn) sendBtn.disabled = true;
        fetch(getApiBase() + '/api/support/bot', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: text })
        })
            .then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
            .then(function(res) {
                if (res.ok && res.body && res.body.reply) {
                    appendMessage('bot', res.body.reply, new Date().toISOString());
                    if (res.body.quickReplies) renderQuickReplies(res.body.quickReplies);
                } else {
                    appendMessage('bot', (res.body && res.body.error) || 'Не удалось получить ответ.', new Date().toISOString());
                }
            })
            .catch(function() {
                appendMessage('bot', 'Сервер недоступен. Попробуйте позже или напишите владельцу.', new Date().toISOString());
            })
            .finally(function() {
                if (sendBtn) sendBtn.disabled = false;
            });
    }

    function isValidEmail(email) {
        return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function sendOwner() {
        var ta = document.getElementById('supportChatInput');
        var text = ta ? String(ta.value || '').trim() : '';
        if (!text) return;
        var nameEl = document.getElementById('supportChatName');
        var emailEl = document.getElementById('supportChatEmail');
        var name = nameEl ? nameEl.value.trim() : '';
        var email = emailEl ? emailEl.value.trim() : '';
        if (!isValidEmail(email)) {
            showSystemMessage('Проверьте e-mail или оставьте поле пустым.');
            if (emailEl) emailEl.focus();
            return;
        }
        saveContact(name, email);
        var tempId = 'pending_' + Date.now();
        appendMessage('visitor', text, new Date().toISOString(), tempId);
        if (ta) ta.value = '';
        var sendBtn = document.getElementById('supportChatSend');
        if (sendBtn) sendBtn.disabled = true;
        fetch(getApiBase() + '/api/support/message', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                visitorId: getVisitorId(),
                text: text,
                name: name,
                email: email,
                page: window.location.href
            })
        })
            .then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
            .then(function(res) {
                if (res.ok && res.body && res.body.message) {
                    var el = messagesEl.querySelector('[data-msg-id="' + tempId + '"]');
                    if (el) el.setAttribute('data-msg-id', res.body.message.id);
                    showSystemMessage(adminOnline
                        ? 'Отправлено. Владелец в сети — ответ появится здесь.'
                        : 'Отправлено. Ответ появится в этом чате, когда владелец будет в сети.');
                } else {
                    removeMessageById(tempId);
                    showSystemMessage((res.body && res.body.error) || 'Не удалось отправить сообщение.');
                }
            })
            .catch(function() {
                removeMessageById(tempId);
                showSystemMessage('Ошибка отправки. Проверьте подключение к интернету.');
            })
            .finally(function() {
                if (sendBtn) sendBtn.disabled = false;
            });
    }

    function onSend() {
        if (mode === 'owner') sendOwner();
        else sendBot();
    }

    function resetPollInterval() {
        if (pollTimer) clearInterval(pollTimer);
        if (!panel || !panel.classList.contains('is-open')) return;
        var ms = mode === 'owner' ? POLL_OWNER_MS : POLL_BOT_MS;
        pollTimer = setInterval(function() {
            fetchPresence();
            syncThread(mode === 'owner');
        }, ms);
    }

    function setMode(next, options) {
        options = options || {};
        if (!ownerModeEnabled && next === 'owner') next = 'bot';
        mode = next;
        document.querySelectorAll('.support-chat-mode-tabs button').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });
        var ownerFields = document.getElementById('supportChatOwnerFields');
        if (ownerFields) ownerFields.classList.toggle('is-visible', mode === 'owner');
        var sendBtn = document.getElementById('supportChatSend');
        var input = document.getElementById('supportChatInput');
        if (sendBtn) sendBtn.textContent = mode === 'owner' ? 'Отправить владельцу' : 'Спросить бота';
        if (headerTitle) headerTitle.textContent = mode === 'owner' ? 'Сообщение владельцу' : 'Поддержка';
        if (input) {
            input.placeholder = mode === 'owner'
                ? 'Опишите вопрос, предложение или проблему…'
                : 'Спросите бота о сервисе…';
        }
        var hint = document.getElementById('supportChatHint');
        if (hint) {
            hint.textContent = mode === 'owner'
                ? 'E-mail — если нужен ответ на почту.'
                : (ownerModeEnabled ? 'Бот — частые вопросы. Личное сообщение — «Владельцу».' : 'Бот — частые вопросы по сервису.');
        }
        if (mode === 'owner') {
            prefillContactFields();
            panel.classList.add('support-chat-panel--owner');
            syncThread(true).then(function() { showOwnerEmptyHint(); });
        } else {
            panel.classList.remove('support-chat-panel--owner');
            renderQuickReplies(['Что такое ранний доступ?', 'Как зарегистрироваться?', 'Лимит объектов']);
        }
        setPresence(adminOnline);
        resetPollInterval();
        if (!options.skipFocus) {
            var focusEl = mode === 'owner' ? input : input;
            if (focusEl) focusEl.focus();
        }
    }

    function togglePanel(open) {
        if (!panel) return;
        var fab = document.getElementById('supportChatFab');
        var isOpen = open !== undefined ? open : !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', isOpen);
        panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if (fab) fab.classList.toggle('is-open', isOpen);
        if (fabWrap) fabWrap.classList.toggle('is-open', isOpen);
        syncMobileState(isOpen);
        if (isOpen) {
            fetchPresence().then(function() {
                return syncThread(mode === 'owner');
            }).then(function() {
                if (mode === 'owner') markThreadRead();
            });
            resetPollInterval();
            prefillContactFields();
            requestAnimationFrame(function() { scrollMessages(); });
        } else if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function buildUi() {
        ownerModeEnabled = !(document.body && document.body.classList.contains('auth-page'));
        if (!ownerModeEnabled) return;
        var fab = document.createElement('button');
        fab.type = 'button';
        fab.id = 'supportChatFab';
        fab.className = 'support-chat-fab';
        fab.title = 'Чат и поддержка';
        fab.setAttribute('aria-label', 'Открыть чат поддержки');
        fab.innerHTML =
            '<span class="support-chat-fab-badge" id="supportChatFabBadge" hidden aria-label="Новый ответ"></span>' +
            '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
        fab.addEventListener('click', function() { togglePanel(); });

        fabWrap = document.createElement('div');
        fabWrap.className = 'support-chat-fab-wrap';
        fabWrap.id = 'supportChatFabWrap';
        var pulse1 = document.createElement('span');
        pulse1.className = 'support-chat-fab-pulse';
        pulse1.setAttribute('aria-hidden', 'true');
        var pulse2 = document.createElement('span');
        pulse2.className = 'support-chat-fab-pulse support-chat-fab-pulse--delay';
        pulse2.setAttribute('aria-hidden', 'true');
        fabWrap.appendChild(pulse1);
        fabWrap.appendChild(pulse2);
        fabWrap.appendChild(fab);

        backdropEl = document.createElement('div');
        backdropEl.id = 'supportChatBackdrop';
        backdropEl.className = 'support-chat-backdrop';
        backdropEl.hidden = true;
        backdropEl.setAttribute('aria-hidden', 'true');

        panel = document.createElement('div');
        panel.id = 'supportChatPanel';
        panel.className = 'support-chat-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Чат поддержки');
        panel.setAttribute('aria-hidden', 'true');

        panel.innerHTML =
            '<div class="support-chat-header">' +
                '<div class="support-chat-header-row">' +
                    '<h3 id="supportChatHeaderTitle">Поддержка</h3>' +
                    '<button type="button" class="support-chat-close" id="supportChatClose" aria-label="Закрыть чат">×</button>' +
                '</div>' +
                '<div class="support-chat-status">' +
                    '<span class="support-chat-status-dot" id="supportChatStatusDot"></span>' +
                    '<span id="supportChatStatusText">Проверка статуса…</span>' +
                '</div>' +
            '</div>' +
            '<div class="support-chat-body">' +
                '<div class="support-chat-messages" id="supportChatMessages"></div>' +
                '<div class="support-chat-quick" id="supportChatQuick"></div>' +
            '</div>' +
            '<div class="support-chat-compose">' +
                '<div class="support-chat-mode-tabs">' +
                    '<button type="button" data-mode="bot" class="active">Бот</button>' +
                    (ownerModeEnabled ? '<button type="button" data-mode="owner">Владельцу</button>' : '') +
                '</div>' +
                (ownerModeEnabled
                    ? '<div class="support-chat-owner-fields" id="supportChatOwnerFields">' +
                        '<div class="support-chat-owner-fields-row">' +
                            '<input type="text" id="supportChatName" placeholder="Имя" maxlength="120" autocomplete="name">' +
                            '<input type="email" id="supportChatEmail" placeholder="E-mail" maxlength="200" autocomplete="email">' +
                        '</div>' +
                    '</div>'
                    : '') +
                '<textarea id="supportChatInput" rows="2" placeholder="Спросите бота о сервисе…" maxlength="4000"></textarea>' +
                '<button type="button" class="support-chat-send" id="supportChatSend">Спросить бота</button>' +
                '<p class="support-chat-hint" id="supportChatHint"></p>' +
            '</div>';

        document.body.appendChild(backdropEl);
        document.body.appendChild(panel);
        document.body.appendChild(fabWrap);

        messagesEl = document.getElementById('supportChatMessages');
        statusDot = document.getElementById('supportChatStatusDot');
        statusText = document.getElementById('supportChatStatusText');
        headerTitle = document.getElementById('supportChatHeaderTitle');
        quickWrap = document.getElementById('supportChatQuick');
        fabBadge = document.getElementById('supportChatFabBadge');

        panel.querySelectorAll('.support-chat-mode-tabs button').forEach(function(btn) {
            btn.addEventListener('click', function() { setMode(btn.getAttribute('data-mode')); });
        });

        document.getElementById('supportChatSend').addEventListener('click', onSend);
        document.getElementById('supportChatClose').addEventListener('click', function() { togglePanel(false); });
        backdropEl.addEventListener('click', function() { togglePanel(false); });
        document.getElementById('supportChatInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
            }
        });
        if (mobileMq && typeof mobileMq.addEventListener === 'function') {
            mobileMq.addEventListener('change', function() {
                syncMobileState(panel && panel.classList.contains('is-open'));
            });
        } else if (mobileMq && typeof mobileMq.addListener === 'function') {
            mobileMq.addListener(function() {
                syncMobileState(panel && panel.classList.contains('is-open'));
            });
        }

        var nameEl = document.getElementById('supportChatName');
        var emailEl = document.getElementById('supportChatEmail');
        if (nameEl) nameEl.addEventListener('change', function() { saveContact(nameEl.value, emailEl ? emailEl.value : ''); });
        if (emailEl) emailEl.addEventListener('change', function() { saveContact(nameEl ? nameEl.value : '', emailEl.value); });

        if (!botWelcomeShown) {
            appendMessage('bot',
                ownerModeEnabled
                    ? 'Здравствуйте! Я отвечу на частые вопросы о «Карте оптической сети». Для личного сообщения разработчику — вкладка «Владельцу».'
                    : 'Здравствуйте! Я отвечу на частые вопросы о «Карте оптической сети».',
                new Date().toISOString()
            );
            botWelcomeShown = true;
        }
        renderQuickReplies(['Что такое ранний доступ?', 'Как зарегистрироваться?', 'Лимит объектов']);
        setMode('bot', { skipFocus: true });
        fetchPresence();
        syncThread(false).then(function() {
            if (hasUnreadAdmin) setFabBadge(true);
        });
        syncMobileState(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUi);
    } else {
        buildUi();
    }
})();
