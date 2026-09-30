(function() {
    'use strict';

    var form = document.getElementById('privacyDeletionForm');
    if (!form) return;

    var statusEl = document.getElementById('privacyDeletionStatus');
    var submitBtn = document.getElementById('privacyDeletionSubmit');

    function setStatus(text, ok) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.remove('is-ok', 'is-error');
        if (text) statusEl.classList.add(ok ? 'is-ok' : 'is-error');
    }

    function getApiBase() {
        try {
            if (typeof window.getApiBase === 'function') return window.getApiBase() || '';
        } catch (e) { /* ignore */ }
        return '';
    }

    function visitorIdForDeletion() {
        var key = 'networkMap_privacyDeletionVisitorId';
        try {
            var existing = localStorage.getItem(key);
            if (existing && existing.length <= 80) return existing;
            var id = 'pd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(key, id);
            return id;
        } catch (e2) {
            return 'pd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        }
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        var organizationName = (document.getElementById('delOrgName').value || '').trim();
        var email = (document.getElementById('delEmail').value || '').trim();
        var username = (document.getElementById('delUsername').value || '').trim();
        var comment = (document.getElementById('delComment').value || '').trim();
        var confirmAuthorized = !!(document.getElementById('delConfirm') && document.getElementById('delConfirm').checked);

        if (organizationName.length < 2) {
            setStatus('Укажите название организации', false);
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setStatus('Укажите корректный e-mail', false);
            return;
        }
        if (username.length < 2) {
            setStatus('Укажите имя пользователя администратора', false);
            return;
        }
        if (!confirmAuthorized) {
            setStatus('Нужно подтвердить полномочия на удаление', false);
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.setAttribute('aria-busy', 'true');
        }
        setStatus('Отправка…', true);

        fetch(getApiBase() + '/api/privacy/deletion-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                organizationName: organizationName,
                email: email,
                username: username,
                comment: comment,
                confirmAuthorized: true,
                visitorId: visitorIdForDeletion()
            })
        }).then(function(r) {
            return r.json().then(function(body) {
                return { status: r.status, body: body || {} };
            });
        }).then(function(res) {
            var body = res.body || {};
            if (res.status >= 200 && res.status < 300 && body.ok) {
                setStatus(body.message || 'Заявление принято. Мы свяжемся с вами по указанному e-mail.', true);
                form.reset();
                return;
            }
            setStatus(body.error || 'Не удалось отправить заявление', false);
        }).catch(function() {
            setStatus('Сервер недоступен. Напишите на support@volsmap.ru', false);
        }).finally(function() {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.removeAttribute('aria-busy');
            }
        });
    });
})();
