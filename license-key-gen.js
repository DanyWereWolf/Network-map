/**
 * Генератор лицензионных ключей для «Карта локальной сети».
 * Использует только создатель приложения. Секрет (LICENSE_SECRET) не должен попадать в репозиторий.
 *
 * Запуск: LICENSE_SECRET=ваш_секрет node license-key-gen.js <срок>
 * Срок: 7d | 30d | 6m | 1y  (7 дней, 30 дней, 6 месяцев, 1 год)
 *
 * Пример: LICENSE_SECRET=mySecret123 node license-key-gen.js 30d
 */

const crypto = require('crypto');

const DURATIONS = {
    '7d': 7,
    '30d': 30,
    '6m': 180,
    '1y': 365
};

function createLicenseKey(secret, durationType) {
    if (!secret || !DURATIONS[durationType]) return null;
    const days = DURATIONS[durationType];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const payload = expiresAt.toISOString() + '|' + durationType;
    const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return payloadB64 + '-' + sig;
}

const secret = process.env.LICENSE_SECRET;
const type = (process.argv[2] || '').toLowerCase();

if (!secret) {
    console.error('Укажите LICENSE_SECRET в окружении. Пример: LICENSE_SECRET=ваш_секрет node license-key-gen.js 30d');
    process.exit(1);
}
if (!DURATIONS[type]) {
    console.error('Укажите срок: 7d, 30d, 6m или 1y');
    process.exit(1);
}

const key = createLicenseKey(secret, type);
console.log('Ключ для срока', type + ':');
console.log(key);
