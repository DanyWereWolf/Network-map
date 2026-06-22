const nodemailer = require('nodemailer');

function getSmtpConfig(serverConfig) {
    const cfg = (serverConfig && serverConfig.smtp) || {};
    const host = String(cfg.host || process.env.SMTP_HOST || '').trim();
    const user = String(cfg.user || process.env.SMTP_USER || '').trim();
    const pass = String(cfg.pass || process.env.SMTP_PASS || '');
    const port = parseInt(cfg.port || process.env.SMTP_PORT || '465', 10);
    const secure = cfg.secure !== undefined
        ? !!cfg.secure
        : (String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false');
    const from = String(cfg.from || process.env.SMTP_FROM || user || '').trim();
    if (!host || !user || !pass) return null;
    return {
        host: host,
        port: isNaN(port) ? 465 : port,
        secure: secure,
        auth: { user: user, pass: pass },
        from: from || user
    };
}

function isMailConfigured(serverConfig) {
    return !!getSmtpConfig(serverConfig);
}

let transporterCache = null;
let transporterKey = '';

function getTransporter(serverConfig) {
    const smtp = getSmtpConfig(serverConfig);
    if (!smtp) return null;
    const key = [smtp.host, smtp.port, smtp.secure, smtp.auth.user].join('|');
    if (transporterCache && transporterKey === key) return transporterCache;
    transporterCache = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth
    });
    transporterKey = key;
    return transporterCache;
}

function sendMail(serverConfig, options) {
    const smtp = getSmtpConfig(serverConfig);
    if (!smtp) {
        return Promise.resolve({ ok: false, error: 'Почтовый сервер не настроен' });
    }
    const transporter = getTransporter(serverConfig);
    const to = options && options.to ? String(options.to).trim() : '';
    const subject = options && options.subject ? String(options.subject) : '';
    const text = options && options.text ? String(options.text) : '';
    const html = options && options.html ? String(options.html) : '';
    if (!to || !subject || (!text && !html)) {
        return Promise.resolve({ ok: false, error: 'Некорректные параметры письма' });
    }
    return transporter.sendMail({
        from: smtp.from,
        to: to,
        subject: subject,
        text: text || undefined,
        html: html || undefined
    }).then(function() {
        return { ok: true };
    }).catch(function(err) {
        console.error('[Mail] Ошибка отправки:', err && err.message ? err.message : err);
        return { ok: false, error: 'Не удалось отправить письмо. Попробуйте позже.' };
    });
}

module.exports = {
    isMailConfigured: isMailConfigured,
    sendMail: sendMail
};
