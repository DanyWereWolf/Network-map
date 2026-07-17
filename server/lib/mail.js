const nodemailer = require('nodemailer');

function extractEmailAddress(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const angle = raw.match(/<([^>]+@[^>]+)>/);
    if (angle) return angle[1].trim();
    if (raw.includes('@')) return raw;
    return '';
}

function getSmtpConfig(serverConfig) {
    const cfg = (serverConfig && serverConfig.smtp) || {};
    const host = String(cfg.host || process.env.SMTP_HOST || '').trim();
    let user = String(cfg.user || process.env.SMTP_USER || '').trim();
    const pass = String(cfg.pass || process.env.SMTP_PASS || '');
    const port = parseInt(cfg.port || process.env.SMTP_PORT || '465', 10);
    const secure = cfg.secure !== undefined
        ? !!cfg.secure
        : (String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false');
    const fromRaw = String(cfg.from || process.env.SMTP_FROM || user || '').trim();
    if (user && !user.includes('@')) {
        const fromEmail = extractEmailAddress(fromRaw);
        if (fromEmail) user = fromEmail;
    }
    const from = fromRaw || user;
    if (!host || !user || !pass) return null;
    if (!user.includes('@')) return null;
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

/**
 * Новый транспорт на каждую операцию.
 * Кэш ломал повторную отправку: после 1-го письма Reg.ru/хостинг
 * закрывает SMTP-сессию, а повтор шёл в уже мёртвое соединение
 * (пока процесс не перезапустят).
 */
function createTransporter(smtp) {
    return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth,
        pool: false,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000
    });
}

function closeTransporter(transporter) {
    if (!transporter) return;
    try {
        transporter.close();
    } catch (e) { /* ignore */ }
}

function sendWithTransporter(transporter, mailOptions) {
    return transporter.sendMail(mailOptions).then(function(info) {
        closeTransporter(transporter);
        return info;
    }, function(err) {
        closeTransporter(transporter);
        throw err;
    });
}

function sendMail(serverConfig, options) {
    const smtp = getSmtpConfig(serverConfig);
    if (!smtp) {
        return Promise.resolve({ ok: false, error: 'Почтовый сервер не настроен' });
    }
    const to = options && options.to ? String(options.to).trim() : '';
    const subject = options && options.subject ? String(options.subject) : '';
    const text = options && options.text ? String(options.text) : '';
    const html = options && options.html ? String(options.html) : '';
    if (!to || !subject || (!text && !html)) {
        return Promise.resolve({ ok: false, error: 'Некорректные параметры письма' });
    }
    const mailOptions = {
        from: smtp.from,
        to: to,
        subject: subject,
        text: text || undefined,
        html: html || undefined
    };

    return sendWithTransporter(createTransporter(smtp), mailOptions).then(function() {
        return { ok: true };
    }).catch(function(err) {
        console.error('[Mail] Ошибка отправки:', err && err.message ? err.message : err);
        // Одна повторная попытка с новым соединением
        return sendWithTransporter(createTransporter(smtp), mailOptions).then(function() {
            console.log('[Mail] Повторная отправка успешна');
            return { ok: true };
        }).catch(function(err2) {
            console.error('[Mail] Повторная отправка не удалась:', err2 && err2.message ? err2.message : err2);
            return { ok: false, error: 'Не удалось отправить письмо. Попробуйте позже.' };
        });
    });
}

function verifySmtp(serverConfig) {
    const smtp = getSmtpConfig(serverConfig);
    if (!smtp) {
        return Promise.resolve({ ok: false, error: 'Почтовый сервер не настроен' });
    }
    const transporter = createTransporter(smtp);
    return transporter.verify().then(function() {
        closeTransporter(transporter);
        return { ok: true, user: smtp.auth.user };
    }).catch(function(err) {
        closeTransporter(transporter);
        const message = err && err.message ? err.message : String(err);
        return { ok: false, error: message, user: smtp.auth.user };
    });
}

function invalidateTransporterCache() {
    // совместимость: кэша больше нет
}

module.exports = {
    isMailConfigured: isMailConfigured,
    sendMail: sendMail,
    verifySmtp: verifySmtp,
    getSmtpConfig: getSmtpConfig,
    invalidateTransporterCache: invalidateTransporterCache
};
