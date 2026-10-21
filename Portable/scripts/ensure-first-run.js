/**
 * Подготовка Portable при первом запуске:
 * - проверка Node >= 20.9
 * - server-config.json из example
 * - каталог data/
 * - печать учётки bootstrap (если только что создали конфиг)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'server-config.json');
const EXAMPLE_PATH = path.join(ROOT, 'server', 'config', 'server-config.example.json');
const DATA_DIR = path.join(ROOT, 'data');
const REQUIRED_MAJOR = 20;
const REQUIRED_MINOR = 9;

function fail(msg) {
    console.error('[setup]', msg);
    process.exit(1);
}

const parts = String(process.versions.node || '0').split('.').map(function(n) {
    return parseInt(n, 10) || 0;
});
const major = parts[0];
const minor = parts[1];
if (major < REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor < REQUIRED_MINOR)) {
    fail('Нужен Node.js >= ' + REQUIRED_MAJOR + '.' + REQUIRED_MINOR + '. Сейчас: ' + process.version);
}

let configCreated = false;
if (!fs.existsSync(CONFIG_PATH)) {
    if (!fs.existsSync(EXAMPLE_PATH)) {
        fail('Нет server/config/server-config.example.json — не из чего создать конфиг.');
    }
    fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
    configCreated = true;
    console.log('[setup] Создан server-config.json из примера.');
}

try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'avatars'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'basemaps'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'chat-media'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'object-media'), { recursive: true });
} catch (e) {
    fail('Не удалось создать data/: ' + (e && e.message ? e.message : e));
}

let cfg = {};
try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    cfg = JSON.parse(text);
} catch (e) {
    fail('server-config.json повреждён: ' + (e && e.message ? e.message : e));
}

const port = parseInt(cfg.port || process.env.PORT || '3000', 10) || 3000;
const user = String(cfg.bootstrapAdminUsername || 'admin');
const pass = String(cfg.bootstrapAdminPassword || 'admin123');
const org = String(cfg.organizationName || 'Организация');

console.log('[setup] Node ' + process.version + ' OK');
console.log('[setup] data/ готов');
console.log('[setup] Порт: ' + port);
if (configCreated) {
    console.log('[setup] Первый вход (после старта сервера):');
    console.log('[setup]   Организация: ' + org);
    console.log('[setup]   Логин:       ' + user);
    console.log('[setup]   Пароль:      ' + pass);
    console.log('[setup] Смените bootstrapAdminPassword в server-config.json после входа.');
}
if (!cfg.yandexMapsApiKey || cfg.yandexMapsApiKey === 'YOUR_YANDEX_MAPS_API_KEY') {
    console.log('[setup] Подсказка: задайте yandexMapsApiKey в server-config.json (если нужны Яндекс.Карты).');
}

process.exit(0);
