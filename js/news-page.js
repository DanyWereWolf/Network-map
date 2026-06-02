/**
 * Публичная страница новостей — загрузка и отрисовка постов.
 */
(function() {
    function escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatDateRu(isoDate) {
        if (!isoDate) return '';
        var parts = String(isoDate).split('-');
        if (parts.length !== 3) return isoDate;
        var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        var d = parseInt(parts[2], 10);
        var m = parseInt(parts[1], 10) - 1;
        if (isNaN(d) || m < 0 || m > 11) return isoDate;
        return d + ' ' + months[m] + ' ' + parts[0];
    }

    function isHtmlBody(body) {
        return /<[a-z][\s\S]*>/i.test(String(body || ''));
    }

    function plainTextToHtml(body) {
        var text = String(body || '').trim();
        if (!text) return '';
        return text.split(/\n\n+/).map(function(block) {
            return '<p>' + escapeHtml(block).replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }

    function bodyToDisplayHtml(body) {
        var raw = String(body || '').trim();
        if (!raw) return '';
        return isHtmlBody(raw) ? raw : plainTextToHtml(raw);
    }

    function renderPost(post) {
        var tags = Array.isArray(post.tags) ? post.tags : [];
        var tagsHtml = tags.length
            ? '<ul class="updates-post-tags" aria-label="Теги">' + tags.map(function(t) {
                return '<li class="updates-post-tag">' + escapeHtml(t) + '</li>';
            }).join('') + '</ul>'
            : '';
        var bodyHtml = bodyToDisplayHtml(post.body);
        var article = document.createElement('article');
        article.className = 'updates-post';
        article.setAttribute('data-post-id', post.id || '');
        article.innerHTML =
            '<header class="updates-post-meta">' +
                '<time class="updates-post-date" datetime="' + escapeHtml(post.date || '') + '">' + escapeHtml(formatDateRu(post.date)) + '</time>' +
                tagsHtml +
            '</header>' +
            '<h2 class="updates-post-title">' + escapeHtml(post.title) + '</h2>' +
            (post.summary ? '<p class="updates-post-summary">' + escapeHtml(post.summary) + '</p>' : '') +
            (bodyHtml ? '<div class="updates-post-body rich-html">' + bodyHtml + '</div>' : '');
        return article;
    }

    function renderFeed(posts) {
        var feed = document.getElementById('updatesFeed');
        if (!feed) return;
        feed.innerHTML = '';
        if (!posts || !posts.length) {
            feed.innerHTML = '<p class="updates-empty" role="status">Пока нет опубликованных новостей. Загляните позже.</p>';
            return;
        }
        posts.forEach(function(post) {
            feed.appendChild(renderPost(post));
        });
    }

    function showState(className, message) {
        var feed = document.getElementById('updatesFeed');
        if (!feed) return;
        feed.innerHTML = '<p class="' + className + '" role="status">' + escapeHtml(message) + '</p>';
    }

    function loadUpdates() {
        showState('updates-loading', 'Загрузка новостей…');
        var base = '';
        try {
            if (typeof getApiBase === 'function') base = getApiBase();
        } catch (e) {}
        if (!base && typeof location !== 'undefined') {
            base = location.origin || '';
        }
        var url = (base ? base.replace(/\/$/, '') : '') + '/api/updates';
        fetch(url, { cache: 'no-store' })
            .then(function(r) {
                if (!r.ok) throw new Error('Не удалось загрузить');
                return r.json();
            })
            .then(function(data) {
                renderFeed((data && data.posts) ? data.posts : []);
            })
            .catch(function() {
                showState('updates-error', 'Не удалось загрузить новости. Обновите страницу позже.');
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadUpdates);
    } else {
        loadUpdates();
    }
})();
