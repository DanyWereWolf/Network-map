#!/usr/bin/env node
/**
 * Проверка SMTP из server-config.json в корне проекта.
 * Запуск: node scripts/test-smtp.js [--send test@example.com]
 */
const path = require('path');
const fs = require('fs');
const mail = require('../server/lib/mail');

const ROOT = path.join(__dirname, '..');
const configPath = path.join(ROOT, 'server-config.json');

if (!fs.existsSync(configPath)) {
    console.error('Не найден:', configPath);
    process.exit(1);
}

let serverConfig;
try {
    serverConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.error('Ошибка чтения server-config.json:', e.message);
    process.exit(1);
}

const smtp = mail.getSmtpConfig(serverConfig);
if (!smtp) {
    console.error('SMTP не настроен. Проверьте host, user (полный e-mail) и pass в server-config.json');
    process.exit(1);
}

console.log('Конфиг:', smtp.auth.user, '@', smtp.host + ':' + smtp.port);
console.log('From:', smtp.from);
console.log('Проверка подключения...');

mail.verifySmtp(serverConfig).then(function(result) {
    if (!result.ok) {
        console.error('FAIL:', result.error);
        process.exit(1);
    }
    console.log('OK: SMTP подключение успешно');

    const sendArg = process.argv.indexOf('--send');
    const to = sendArg >= 0 ? process.argv[sendArg + 1] : '';
    if (!to) {
        console.log('Тестовое письмо не отправлялось. Для отправки: node scripts/test-smtp.js --send you@mail.ru');
        return;
    }

    return mail.sendMail(serverConfig, {
        to: to,
        subject: 'Тест SMTP — Карта оптической сети',
        text: 'Если вы видите это письмо, SMTP настроен правильно.'
    }).then(function(sendResult) {
        if (!sendResult.ok) {
            console.error('Отправка FAIL:', sendResult.error);
            process.exit(1);
        }
        console.log('OK: письмо отправлено на', to);
    });
}).catch(function(err) {
    console.error('Ошибка:', err && err.message ? err.message : err);
    process.exit(1);
});
