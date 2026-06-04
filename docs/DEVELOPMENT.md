# Разработка

## Требования

- **Node.js** 18+ (LTS рекомендуется)
- **npm**
- Ключ [API Яндекс.Карт](https://developer.tech.yandex.ru/) в `server-config.json`
- Для входа локально — тестовые ключи Turnstile уже в шаблоне конфига

## Первый запуск

```bash
git clone <repo-url>
cd Network-map
npm install
cp server/config/server-config.example.json server-config.json
# Отредактируйте server-config.json: yandexMapsApiKey
npm run api
```

Откройте [http://localhost:3000](http://localhost:3000). Карта: [http://localhost:3000/index.html](http://localhost:3000/index.html).

**Windows:** двойной клик по `run-api.bat` (установит зависимости при необходимости).

**Linux/macOS:** `chmod +x run-api.sh && ./run-api.sh`

При первом запуске API создаётся `data/store.json` и пользователь-администратор (логин/пароль см. в консоли или логике `database.js` — часто `admin` / `admin123`).

## npm-скрипты

| Команда | Действие |
|---------|----------|
| `npm run api` | Основной сервер: REST + WebSocket `/sync` + статика из `public/` |
| `npm run sync` | Только WebSocket (`server/server.js`), без REST |
| `npm run check` | Синтаксическая проверка всех клиентских и серверных `.js` |
| `npm run build` | Обфускация `public/js/app/main.js` и `auth.js` → `dist/` |
| `npm run obfuscate:main` | Только main.js |
| `npm run obfuscate:auth` | Только auth.js |
| `npm run copy-assets` | Копирование `public/` в `dist/public` (Windows xcopy) |

## Проверка перед коммитом

```bash
npm run check
```

Проверяются файлы в `public/js/`, `public/js/app/`, `server/` и `server/lib/`.

## Переменные окружения

Переопределяют поля `server-config.json`:

| Переменная | Поле конфига |
|------------|----------------|
| `PORT` | `port` |
| `HOST` | `host` |
| `TURNSTILE_SITE_KEY` | `turnstileSiteKey` |
| `TURNSTILE_SECRET_KEY` | `turnstileSecretKey` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `authRateLimitWindowMs` |
| `AUTH_RATE_LIMIT_MAX` | `authRateLimitMax` |
| `DB_PATH` | Путь к БД (legacy: подмена расширения `.db` → `-store.json`) |

## Типичные задачи

### Изменить версию приложения

Синхронно обновите:

1. `public/js/core/config.js` — `APP_VERSION`
2. `package.json` — поле `version`
3. `README.md` — раздел «История изменений»

### Добавить клиентский модуль

1. Файл в подходящую папку `public/js/` (см. [FRONTEND.md](FRONTEND.md))
2. Подключите `<script src="js/...">` в `index.html` **в правильном порядке** (зависимости выше по списку)
3. `npm run check`

### Добавить API-эндпоинт

Логика в `server/server-api.js`; персистентность — `server/database.js`.

### Сбросить локальные данные

Остановите сервер, удалите или переименуйте `data/store.json`, запустите снова.

### Работа без API

Карта **не работает** без `npm run api`: нет загрузки карты организации, синхронизации и ключей с `/api/public-config`.

## Отладка синхронизации

- WebSocket: `ws://localhost:3000/sync` (тот же хост, что и страница)
- В UI: блок «Синхронизация» → «Подключиться»
- Операции: `type: 'op'`; полное состояние: `type: 'state'` (debounce на клиенте)

## Производительность больших карт

См. [FRONTEND.md](FRONTEND.md#производительность-карты) — индекс объектов, viewport, инкрементальные линии связи.
