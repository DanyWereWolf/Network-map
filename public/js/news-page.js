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

    function getPostAnchorId(postId) {
        var id = String(postId || '').trim();
        return id ? 'post-' + id : '';
    }

    function getPostShareUrl(postId) {
        var anchor = getPostAnchorId(postId);
        if (!anchor) return location.href.split('#')[0];
        var path = location.pathname || '/news.html';
        if (!/\/news\.html$/i.test(path)) path = '/news.html';
        return location.origin + path + '#' + anchor;
    }

    function showShareFeedback(btn) {
        if (!btn) return;
        var label = btn.querySelector('.updates-post-share-label');
        if (!label) return;
        var prev = btn.getAttribute('data-share-label') || label.textContent;
        btn.setAttribute('data-share-label', prev);
        label.textContent = 'Ссылка скопирована';
        btn.disabled = true;
        window.setTimeout(function() {
            label.textContent = prev;
            btn.disabled = false;
        }, 2000);
    }

    function copyShareUrl(url, btn) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(url).then(function() {
                showShareFeedback(btn);
            }).catch(function() {
                window.prompt('Скопируйте ссылку:', url);
            });
        }
        window.prompt('Скопируйте ссылку:', url);
        return Promise.resolve();
    }

    function sharePost(post, btn) {
        var url = getPostShareUrl(post.id);
        var title = String(post.title || 'Новость').trim();
        var text = String(post.summary || title).trim();
        if (navigator.share) {
            navigator.share({ title: title, text: text, url: url }).catch(function(err) {
                if (err && err.name === 'AbortError') return;
                copyShareUrl(url, btn);
            });
            return;
        }
        copyShareUrl(url, btn);
    }

    function scrollToPostFromHash() {
        var hash = (location.hash || '').replace(/^#/, '');
        if (!hash) return;
        var el = document.getElementById(hash);
        if (!el) return;
        window.requestAnimationFrame(function() {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('updates-post--highlight');
            window.setTimeout(function() {
                el.classList.remove('updates-post--highlight');
            }, 2200);
        });
    }

    var BRAND_ICON_SVG =
        '<svg class="updates-post-brand-icon" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">' +
            '<rect width="32" height="32" rx="6" fill="currentColor"></rect>' +
            '<path d="M16 6c-3.3 0-6 2.7-6 6 0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"></path>' +
            '<circle cx="16" cy="12" r="2.5" fill="#fff"></circle>' +
        '</svg>';

    function renderPost(post) {
        var tags = Array.isArray(post.tags) ? post.tags : [];
        var tagsHtml = tags.length
            ? '<header class="updates-post-meta">' +
                '<ul class="updates-post-tags" aria-label="Теги">' + tags.map(function(t) {
                    return '<li class="updates-post-tag">' + escapeHtml(t) + '</li>';
                }).join('') + '</ul>' +
              '</header>'
            : '';
        var bodyHtml = bodyToDisplayHtml(post.body);
        var anchorId = getPostAnchorId(post.id);
        var article = document.createElement('article');
        article.className = 'updates-post';
        article.setAttribute('data-post-id', post.id || '');
        if (anchorId) article.id = anchorId;
        article.innerHTML =
            '<div class="updates-post-top">' +
                '<div class="updates-post-top-left">' +
                    '<span class="updates-post-brand" title="Карта оптической сети">' + BRAND_ICON_SVG + '</span>' +
                    '<time class="updates-post-date" datetime="' + escapeHtml(post.date || '') + '">' + escapeHtml(formatDateRu(post.date)) + '</time>' +
                '</div>' +
                '<button type="button" class="updates-post-share" data-share-post title="Поделиться записью" aria-label="Поделиться записью">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                        '<circle cx="18" cy="5" r="3"></circle>' +
                        '<circle cx="6" cy="12" r="3"></circle>' +
                        '<circle cx="18" cy="19" r="3"></circle>' +
                        '<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>' +
                        '<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>' +
                    '</svg>' +
                    '<span class="updates-post-share-label">Поделиться</span>' +
                '</button>' +
            '</div>' +
            tagsHtml +
            '<h2 class="updates-post-title">' + escapeHtml(post.title) + '</h2>' +
            (post.summary ? '<p class="updates-post-summary">' + escapeHtml(post.summary) + '</p>' : '') +
            (bodyHtml ? '<div class="updates-post-body rich-html">' + bodyHtml + '</div>' : '');
        var shareBtn = article.querySelector('[data-share-post]');
        if (shareBtn) {
            shareBtn.addEventListener('click', function() {
                sharePost(post, shareBtn);
            });
        }
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
        scrollToPostFromHash();
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
    window.addEventListener('hashchange', scrollToPostFromHash);
})();
