(function (global) {
    'use strict';

    var _openCounts = Object.create(null);
    var _badgeByUid = Object.create(null);

    function apiBase() {
        return typeof getApiBase === 'function' ? getApiBase() : '';
    }

    function authHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (token) h.Authorization = 'Bearer ' + token;
        return h;
    }

    function canPostComment() {
        if (!global.currentUser || global.currentUser.embed || global.currentUser.share) return false;
        return true;
    }

    function canManageTasks() {
        return typeof canEdit === 'function' ? canEdit() : false;
    }

    function fetchComments(objectUniqueId) {
        var base = apiBase();
        if (!base || !objectUniqueId) return Promise.resolve([]);
        return fetch(base.replace(/\/$/, '') + '/api/object-comments?objectUniqueId=' + encodeURIComponent(objectUniqueId), {
            headers: authHeaders()
        }).then(function (r) { return r.json(); })
            .then(function (body) {
                if (body.error) throw new Error(body.error);
                return Array.isArray(body.comments) ? body.comments : [];
            });
    }

    function refreshOpenCounts() {
        var base = apiBase();
        if (!base) return Promise.resolve(_openCounts);
        return fetch(base.replace(/\/$/, '') + '/api/object-comments/open-counts', {
            headers: authHeaders()
        }).then(function (r) { return r.json(); })
            .then(function (body) {
                _openCounts = (body && body.counts) || {};
                applyTaskBadgesToMap();
                return _openCounts;
            }).catch(function () { return _openCounts; });
    }

    function postComment(objectUniqueId, text, kind) {
        var base = apiBase();
        if (!base) return Promise.reject(new Error('Нет API'));
        return fetch(base.replace(/\/$/, '') + '/api/object-comments', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                objectUniqueId: objectUniqueId,
                text: text,
                kind: kind === 'task' ? 'task' : 'comment'
            })
        }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error((res.body && res.body.error) || 'Ошибка');
                refreshOpenCounts();
                return res.body.comment;
            });
    }

    function patchComment(id, patch) {
        var base = apiBase();
        if (!base) return Promise.reject(new Error('Нет API'));
        return fetch(base.replace(/\/$/, '') + '/api/object-comments/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(patch || {})
        }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error((res.body && res.body.error) || 'Ошибка');
                refreshOpenCounts();
                return res.body.comment;
            });
    }

    function deleteComment(id) {
        var base = apiBase();
        if (!base) return Promise.reject(new Error('Нет API'));
        return fetch(base.replace(/\/$/, '') + '/api/object-comments/' + encodeURIComponent(id), {
            method: 'DELETE',
            headers: authHeaders()
        }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error((res.body && res.body.error) || 'Ошибка');
                refreshOpenCounts();
                return true;
            });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderCommentsPanelHtml(objectUniqueId) {
        return '<div class="object-comments-panel" data-object-comments="' + escapeHtml(objectUniqueId) + '">' +
            '<div class="object-comments-list" id="objectCommentsList">Загрузка…</div>' +
            (canPostComment()
                ? ('<div class="object-comments-compose" style="margin-top:0.75rem;">' +
                    '<textarea id="objectCommentText" class="form-input" rows="2" placeholder="Комментарий или задача…" style="width:100%;resize:vertical;"></textarea>' +
                    '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
                    '<button type="button" class="btn-primary btn-sm" id="objectCommentSendBtn">Комментарий</button>' +
                    (canManageTasks() ? '<button type="button" class="btn-secondary btn-sm" id="objectTaskSendBtn">Задача</button>' : '') +
                    '</div></div>')
                : '') +
            '</div>';
    }

    function bindCommentsPanel(objectUniqueId) {
        var listEl = document.getElementById('objectCommentsList');
        if (!listEl) return;
        fetchComments(objectUniqueId).then(function (comments) {
            if (!comments.length) {
                listEl.innerHTML = '<div class="hint">Пока нет комментариев</div>';
            } else {
                listEl.innerHTML = comments.map(function (c) {
                    var when = c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU') : '';
                    var kindLabel = c.kind === 'task'
                        ? ('<span class="object-comment-task-pill">' + (c.status === 'done' ? 'Задача · готово' : 'Задача · открыта') + '</span>')
                        : '';
                    var actions = '';
                    if (c.kind === 'task' && canManageTasks() && c.status !== 'done') {
                        actions += '<button type="button" class="btn-secondary btn-sm" data-oc-done="' + escapeHtml(c.id) + '">Готово</button>';
                    }
                    if (canPostComment() && (String(c.userId) === String(global.currentUser && global.currentUser.userId) ||
                        (global.currentUser && global.currentUser.role === 'admin'))) {
                        actions += '<button type="button" class="btn-secondary btn-sm" data-oc-del="' + escapeHtml(c.id) + '">Удалить</button>';
                    }
                    return '<div class="object-comment-item" style="margin-bottom:0.65rem;padding-bottom:0.5rem;border-bottom:1px solid var(--border-color,rgba(0,0,0,.08));">' +
                        '<div style="font-size:0.8rem;opacity:0.8;">' + escapeHtml(c.userName || '') + ' · ' + escapeHtml(when) + ' ' + kindLabel + '</div>' +
                        '<div style="white-space:pre-wrap;">' + escapeHtml(c.text) + '</div>' +
                        (actions ? '<div style="margin-top:4px;display:flex;gap:4px;">' + actions + '</div>' : '') +
                        '</div>';
                }).join('');
            }
            listEl.querySelectorAll('[data-oc-done]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    patchComment(btn.getAttribute('data-oc-done'), { status: 'done' }).then(function () {
                        bindCommentsPanel(objectUniqueId);
                    }).catch(function (e) {
                        if (typeof showError === 'function') showError(e.message || 'Ошибка');
                    });
                });
            });
            listEl.querySelectorAll('[data-oc-del]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!window.confirm('Удалить комментарий?')) return;
                    deleteComment(btn.getAttribute('data-oc-del')).then(function () {
                        bindCommentsPanel(objectUniqueId);
                    }).catch(function (e) {
                        if (typeof showError === 'function') showError(e.message || 'Ошибка');
                    });
                });
            });
        }).catch(function (e) {
            listEl.textContent = e.message || 'Не удалось загрузить';
        });

        var sendBtn = document.getElementById('objectCommentSendBtn');
        var taskBtn = document.getElementById('objectTaskSendBtn');
        var textEl = document.getElementById('objectCommentText');
        function send(kind) {
            var text = textEl ? String(textEl.value || '').trim() : '';
            if (!text) return;
            postComment(objectUniqueId, text, kind).then(function () {
                if (textEl) textEl.value = '';
                bindCommentsPanel(objectUniqueId);
            }).catch(function (e) {
                if (typeof showError === 'function') showError(e.message || 'Ошибка');
            });
        }
        if (sendBtn) sendBtn.onclick = function () { send('comment'); };
        if (taskBtn) taskBtn.onclick = function () { send('task'); };
    }

    function applyTaskBadgesToMap() {
        if (typeof objects === 'undefined' || !Array.isArray(objects)) return;
        objects.forEach(function (obj) {
            if (!obj || !obj.properties) return;
            var uid = obj.properties.get('uniqueId');
            if (uid == null) return;
            var n = _openCounts[String(uid)] || 0;
            var hint = obj.properties.get('hintContent') || obj.properties.get('name') || '';
            var baseHint = String(hint).replace(/\s*·\s*задач[иа]?:\s*\d+/i, '').trim();
            if (n > 0) {
                try {
                    obj.properties.set('hintContent', baseHint + ' · задач: ' + n);
                } catch (e) {}
            } else if (baseHint !== hint) {
                try { obj.properties.set('hintContent', baseHint); } catch (e2) {}
            }
            _badgeByUid[String(uid)] = n;
        });
    }

    function getOpenCount(uid) {
        return _openCounts[String(uid)] || 0;
    }

    global.ObjectComments = {
        renderCommentsPanelHtml: renderCommentsPanelHtml,
        bindCommentsPanel: bindCommentsPanel,
        refreshOpenCounts: refreshOpenCounts,
        getOpenCount: getOpenCount,
        applyTaskBadgesToMap: applyTaskBadgesToMap
    };
})(typeof window !== 'undefined' ? window : this);
