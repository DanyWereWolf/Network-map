'use strict';

const db = require('../database');
const passwordReset = require('./password-reset');

const MAX_SUBJECT = 180;
const MAX_TITLE = 200;
const MAX_INTRO = 2000;
const MAX_BODY = 8000;
const MAX_CTA_LABEL = 80;
const MAX_CTA_URL = 500;
const MAX_BADGE = 60;
const SEND_DELAY_MS = 350;

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

function normalizeSiteUrl(siteUrl) {
    return String(siteUrl || '').trim().replace(/\/$/, '');
}

function absoluteUrl(siteUrl, pathOrUrl) {
    const raw = String(pathOrUrl || '').trim();
    if (!raw) {
        const base = normalizeSiteUrl(siteUrl);
        return base || 'https://volsmap.ru';
    }
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = normalizeSiteUrl(siteUrl) || 'https://volsmap.ru';
    if (raw.charAt(0) === '/') return base + raw;
    return base + '/' + raw;
}

function isActiveUser(user) {
    if (!user) return false;
    if (user.status === 'pending' || user.status === 'rejected') return false;
    return true;
}

/**
 * Уникальные адреса: пользовательский email или contactEmail организации.
 */
function collectRecipients(serverConfig) {
    const users = db.getUsers().filter(isActiveUser);
    const byEmail = new Map();
    users.forEach(function(user) {
        const email = passwordReset.resolveUserEmail(user, serverConfig);
        if (!email || !passwordReset.isValidEmail(email)) return;
        const key = email.toLowerCase();
        if (byEmail.has(key)) return;
        let orgName = '';
        if (user.organizationId) {
            const org = db.getOrganization(user.organizationId);
            if (org && org.name) orgName = String(org.name);
        }
        byEmail.set(key, {
            email: email,
            username: user.username || '',
            fullName: user.fullName || '',
            organizationName: orgName
        });
    });
    return Array.from(byEmail.values()).sort(function(a, b) {
        return a.email.localeCompare(b.email, 'ru');
    });
}

function parseBodyLines(body) {
    const raw = String(body || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return { paragraphs: [], bullets: [] };
    const blocks = raw.split(/\n{2,}/);
    const paragraphs = [];
    const bullets = [];
    blocks.forEach(function(block) {
        const lines = block.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        if (!lines.length) return;
        const allBullets = lines.every(function(l) {
            return /^[-•*]\s+/.test(l) || /^\d+[.)]\s+/.test(l);
        });
        if (allBullets) {
            lines.forEach(function(l) {
                bullets.push(l.replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim());
            });
        } else {
            paragraphs.push(lines.join(' '));
        }
    });
    return { paragraphs: paragraphs, bullets: bullets };
}

function sanitizePayload(input) {
    const src = input || {};
    const subject = String(src.subject || '').trim().slice(0, MAX_SUBJECT);
    const title = String(src.title || '').trim().slice(0, MAX_TITLE);
    const intro = String(src.intro || '').trim().slice(0, MAX_INTRO);
    const body = String(src.body || '').trim().slice(0, MAX_BODY);
    const badge = String(src.badge || 'Обновление').trim().slice(0, MAX_BADGE) || 'Обновление';
    const ctaLabel = String(src.ctaLabel || 'Смотреть новости').trim().slice(0, MAX_CTA_LABEL) || 'Смотреть новости';
    let ctaUrl = String(src.ctaUrl || '/news.html').trim().slice(0, MAX_CTA_URL) || '/news.html';
    if (!subject) return { error: 'Укажите тему письма' };
    if (!title) return { error: 'Укажите заголовок' };
    if (!intro && !body) return { error: 'Добавьте текст обновления' };
    return {
        subject: subject,
        title: title,
        intro: intro,
        body: body,
        badge: badge,
        ctaLabel: ctaLabel,
        ctaUrl: ctaUrl
    };
}

function buildUpdateEmail(siteUrl, payload) {
    const data = sanitizePayload(payload);
    if (data.error) return data;

    const parsed = parseBodyLines(data.body);
    const newsUrl = absoluteUrl(siteUrl, data.ctaUrl);
    const homeUrl = normalizeSiteUrl(siteUrl) || 'https://volsmap.ru';
    const year = new Date().getFullYear();

    const bulletHtml = parsed.bullets.map(function(item) {
        return [
            '<tr>',
            '<td style="padding:0 0 12px 0;">',
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">',
            '<tr>',
            '<td width="44" valign="top" style="padding:14px 0 14px 14px;">',
            '<div style="width:28px;height:28px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:28px;text-align:center;font-weight:700;">✓</div>',
            '</td>',
            '<td style="padding:14px 16px 14px 8px;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;">',
            escapeHtml(item),
            '</td>',
            '</tr>',
            '</table>',
            '</td>',
            '</tr>'
        ].join('');
    }).join('');

    const paragraphHtml = parsed.paragraphs.map(function(p) {
        return '<p style="margin:0 0 16px 0;font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.65;color:#334155;">' +
            escapeHtml(p) + '</p>';
    }).join('');

    const introHtml = data.intro
        ? '<p style="margin:0 0 22px 0;font-family:Segoe UI,Arial,sans-serif;font-size:16px;line-height:1.65;color:#475569;">' +
            escapeHtml(data.intro) + '</p>'
        : '';

    const html = [
        '<!DOCTYPE html>',
        '<html lang="ru">',
        '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>' + escapeHtml(data.subject) + '</title></head>',
        '<body style="margin:0;padding:0;background:#eef2ff;">',
        '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">',
        escapeHtml(data.intro || data.title),
        '</div>',
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef2ff;padding:28px 12px;">',
        '<tr><td align="center">',
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">',
        // header
        '<tr><td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 55%,#0ea5e9 100%);padding:28px 32px 24px 32px;">',
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>',
        '<td style="font-family:Segoe UI,Arial,sans-serif;color:#ffffff;">',
        '<div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;margin-bottom:8px;">Volsmap</div>',
        '<div style="font-size:22px;font-weight:700;line-height:1.25;">Карта оптической сети</div>',
        '</td>',
        '<td align="right" valign="top">',
        '<span style="display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.28);">',
        escapeHtml(data.badge),
        '</span>',
        '</td>',
        '</tr></table>',
        '</td></tr>',
        // body
        '<tr><td style="padding:32px 32px 8px 32px;">',
        '<h1 style="margin:0 0 16px 0;font-family:Segoe UI,Arial,sans-serif;font-size:26px;line-height:1.25;color:#0f172a;font-weight:700;">',
        escapeHtml(data.title),
        '</h1>',
        introHtml,
        paragraphHtml,
        (bulletHtml ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 8px 0;">' + bulletHtml + '</table>' : ''),
        '</td></tr>',
        // CTA
        '<tr><td style="padding:8px 32px 36px 32px;" align="left">',
        '<a href="' + escapeHtml(newsUrl) + '" style="display:inline-block;background:#1d4ed8;color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 22px;border-radius:12px;box-shadow:0 8px 20px rgba(29,78,216,0.28);">',
        escapeHtml(data.ctaLabel),
        '</a>',
        '<p style="margin:18px 0 0 0;font-family:Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.5;color:#94a3b8;">',
        'Если кнопка не открывается, перейдите по ссылке:<br>',
        '<a href="' + escapeHtml(newsUrl) + '" style="color:#2563eb;word-break:break-all;">' + escapeHtml(newsUrl) + '</a>',
        '</p>',
        '</td></tr>',
        // footer
        '<tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 32px;">',
        '<p style="margin:0 0 6px 0;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#64748b;">',
        'Вы получили это письмо, потому что указали контактный e-mail в аккаунте Volsmap.',
        '</p>',
        '<p style="margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#94a3b8;">',
        '© ' + year + ' <a href="' + escapeHtml(homeUrl) + '" style="color:#64748b;text-decoration:none;">volsmap.ru</a> — Карта оптической сети',
        '</p>',
        '</td></tr>',
        '</table>',
        '</td></tr></table>',
        '</body></html>'
    ].join('');

    const textParts = [
        'Volsmap — Карта оптической сети',
        data.badge,
        '',
        data.title,
        ''
    ];
    if (data.intro) textParts.push(data.intro, '');
    parsed.paragraphs.forEach(function(p) { textParts.push(p, ''); });
    if (parsed.bullets.length) {
        parsed.bullets.forEach(function(b) { textParts.push('• ' + b); });
        textParts.push('');
    }
    textParts.push(data.ctaLabel + ': ' + newsUrl);
    textParts.push('');
    textParts.push('— volsmap.ru');

    return {
        subject: data.subject,
        title: data.title,
        intro: data.intro,
        body: data.body,
        badge: data.badge,
        ctaLabel: data.ctaLabel,
        ctaUrl: data.ctaUrl,
        html: html,
        text: textParts.join('\n'),
        newsUrl: newsUrl
    };
}

module.exports = {
    MAX_SUBJECT: MAX_SUBJECT,
    MAX_TITLE: MAX_TITLE,
    MAX_INTRO: MAX_INTRO,
    MAX_BODY: MAX_BODY,
    SEND_DELAY_MS: SEND_DELAY_MS,
    collectRecipients: collectRecipients,
    sanitizePayload: sanitizePayload,
    buildUpdateEmail: buildUpdateEmail,
    escapeHtml: escapeHtml,
    sleep: sleep,
    absoluteUrl: absoluteUrl
};
