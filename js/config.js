/**
 * Конфигурация приложения «Карта локальной сети»
 * Версию менять перед созданием нового релиза на GitHub.
 */
const APP_VERSION = '1.0.1';
const GITHUB_REPO = { owner: 'DanyWereWolf', repo: 'Network-map' };

/** Результат проверки обновлений при старте сессии (заполняется в main.js) */
var lastUpdateCheckResult = null;

/**
 * Адрес API (база данных). Если задан — карта, пользователи и история берутся с сервера.
 * Пример: 'http://localhost:3000' (запуск сервера: npm run api)
 * Пустая строка — работа только с localStorage (без сервера).
 */
var API_BASE = ''; // Для работы с БД укажите, например: 'http://localhost:3000'
