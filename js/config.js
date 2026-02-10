/**
 * Конфигурация приложения «Карта локальной сети»
 * Версию менять перед созданием нового релиза на GitHub.
 */
const APP_VERSION = '1.0.1';
const GITHUB_REPO = { owner: 'DanyWereWolf', repo: 'Network-map' };

/** Результат проверки обновлений при старте сессии (заполняется в main.js) */
var lastUpdateCheckResult = null;

/**
 * Адрес API (база данных). Если пусто — используется тот же хост, с которого открыта страница
 * (при запуске через npm run api база всегда подтягивается из проекта, без настройки).
 * Можно задать вручную, например: 'http://localhost:3000'
 */
var API_BASE = '';

/** Базовый URL для API: заданный API_BASE или текущий хост (только http/https). */
function getApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE && String(API_BASE).trim() !== '') return String(API_BASE).trim();
    var o = typeof window !== 'undefined' && window.location && window.location.origin;
    return (o && (o.indexOf('http://') === 0 || o.indexOf('https://') === 0)) ? o : '';
}
