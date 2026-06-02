/**
 * Санитизация HTML-тела новостного поста.
 */
const sanitizeHtml = require('sanitize-html');

const ALLOWED_IFRAME_HOSTS = [
    'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
    'player.vimeo.com', 'vimeo.com', 'rutube.ru', 'www.rutube.ru',
    'vk.com', 'vkvideo.ru'
];

function escapePlainText(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function plainTextToHtml(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return '';
    return trimmed.split(/\n\n+/).map(function(block) {
        return '<p>' + escapePlainText(block).replace(/\n/g, '<br>') + '</p>';
    }).join('');
}

function sanitizeNewsBody(html) {
    if (html == null) return '';
    const raw = String(html).trim();
    if (!raw) return '';
    if (raw.indexOf('<') === -1) {
        return plainTextToHtml(raw);
    }
    return sanitizeHtml(raw, {
        allowedTags: [
            'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
            'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li',
            'a', 'img', 'video', 'source', 'figure', 'figcaption',
            'span', 'div', 'iframe', 'hr', 'sub', 'sup'
        ],
        allowedAttributes: {
            a: ['href', 'name', 'target', 'rel', 'class', 'download', 'title'],
            img: ['src', 'alt', 'title', 'width', 'height', 'class', 'loading'],
            video: ['src', 'controls', 'width', 'height', 'poster', 'class', 'preload', 'playsinline'],
            source: ['src', 'type'],
            iframe: ['src', 'frameborder', 'allowfullscreen', 'allow', 'class', 'title', 'width', 'height'],
            span: ['class', 'style'],
            p: ['class', 'style'],
            div: ['class', 'style'],
            h1: ['class'], h2: ['class'], h3: ['class'], h4: ['class'],
            blockquote: ['class'],
            figure: ['class'],
            figcaption: ['class'],
            li: ['class'],
            ul: ['class'],
            ol: ['class']
        },
        allowedStyles: {
            '*': {
                'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
                'text-align': [/^(?:left|right|center|justify)$/],
                'color': [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i]
            }
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data'],
            video: ['http', 'https'],
            source: ['http', 'https']
        },
        transformTags: {
            iframe: function(tagName, attribs) {
                const src = attribs.src || '';
                let host = '';
                try {
                    host = new URL(src, 'https://example.com').hostname.toLowerCase();
                } catch (e) {
                    return { tagName: '', attribs: {} };
                }
                if (ALLOWED_IFRAME_HOSTS.indexOf(host) === -1) {
                    return { tagName: '', attribs: {} };
                }
                return {
                    tagName: 'iframe',
                    attribs: {
                        src: src,
                        class: attribs.class || 'ql-video',
                        frameborder: '0',
                        allowfullscreen: 'true',
                        title: attribs.title || 'Видео'
                    }
                };
            },
            a: function(tagName, attribs) {
                const href = attribs.href || '';
                if (href && href.toLowerCase().indexOf('javascript:') === 0) {
                    return { tagName: 'span', attribs: {} };
                }
                return {
                    tagName: 'a',
                    attribs: Object.assign({}, attribs, {
                        rel: 'noopener noreferrer',
                        target: attribs.target === '_blank' ? '_blank' : undefined
                    })
                };
            }
        },
        exclusiveFilter: function(frame) {
            if (frame.tag === 'img' && frame.attribs && frame.attribs.src) {
                const src = String(frame.attribs.src);
                if (/^javascript:/i.test(src)) return true;
            }
            return false;
        }
    }).trim();
}

module.exports = {
    sanitizeNewsBody,
    plainTextToHtml
};
