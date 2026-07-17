# Разработка

## Требования

- **Node.js** 18+ (LTS рекомендуется)
- **npm**
- Ключ [API Яндекс.Карт](https://developer.tech.yandex.ru/) в `server-config.json`
- Для входа локально — тестовые ключи Turnstile уже в шаблоне конфига
- Опционально **MySQL 8+** (режим `storage: "mysql"`)

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

**Linux/macOS:** `chmod +x run-api.sh && ./run-api.sh`

Если в `server-config.json` стоит `"storage": "mysql"`, а MySQL недоступен — скрипт предложит установить БД и мигрировать `data/store.json` (`sudo`). Без спроса: `AUTO_MYSQL=1 ./run-api.sh`. Отключить предложение: `SKIP_MYSQL_SETUP=1 ./run-api.sh`.

**Windows:** двойной клик по `run-api.bat` (установит зависимости при необходимости).

При первом запуске API создаётся `data/store.json` и пользователь-администратор (логин/пароль см. в консоли или логике `database.js` — часто `admin` / `admin123`).

## npm-скрипты

| Команда | Действие |
|---------|----------|
| `npm run api` | Основной сервер: REST + WebSocket `/sync` + статика из `public/` |
| `npm run sync` | Только WebSocket (`server/server.js`), без REST |
| `npm run check` | Синтаксическая проверка всех клиентских и серверных `.js` |
| `npm run build` | Копия `public/` → `dist/` + обфускация всех клиентских JS |
| `npm run db:migrate` | Применить MySQL schema (`server/db/schema.sql`) |
| `npm run migrate:mysql` | Импорт `data/store.json` → MySQL |
| `npm run test:mysql-parity` | Паритет assemble/disassemble для org |
| `npm run backup:mysql` | Логический JSON-экспорт (+ `--dump` для mysqldump) |

## Проверка перед коммитом

```bash
npm run verify
```

Или по отдельности:

| Команда | Назначение |
|---------|------------|
| `npm run check` | Синтаксис JS (`node --check`) |
| `npm run lint` | ESLint: локальные неиспользуемые переменные, unreachable code |
| `npm run dead-code` | Неиспользуемые top-level функции и глобальные экспорты (код выхода 1, если есть находки) |
| `npm run knip` | Неиспользуемые npm-зависимости и файлы (entry из `knip.json`) |
| `npm run format:check` | Prettier без записи |
| `npm run format` | Автоформатирование (`.prettierignore` исключает CSS и `data/`) |

**Мёртвый код:** клиент без ES-модулей — `npm run dead-code` ищет символы, на которые нет ссылок ни в одном `.js`/`.html`. ESLint для `public/js/` проверяет только *локальные* переменные внутри функций (`vars: local`), чтобы не шуметь на глобальных `function` в `main.js`.

## Переменные окружения

Переопределяют поля `server-config.json`:

| Переменная | Поле конфига |
|------------|----------------|
| `PORT` | `port` |
| `HOST` | `host` |
| `SERVE_OBFUSCATED_CLIENT` | `serveObfuscatedClient` (`1` / `true` — раздавать `dist/` после `npm run build`) |
| `TURNSTILE_SITE_KEY` | `turnstileSiteKey` |
| `TURNSTILE_SECRET_KEY` | `turnstileSecretKey` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `authRateLimitWindowMs` |
| `AUTH_RATE_LIMIT_MAX` | `authRateLimitMax` |
| `DB_PATH` | Путь к БД (legacy: подмена расширения `.db` → `-store.json`) |
| `STORAGE` | `json` / `mysql` (перекрывает `storage` в конфиге) |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Параметры MySQL |
| `MYSQL_MIRROR_JSON` | `1` — в режиме MySQL ещё писать `store.json` |

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

### Переход на MySQL

**Автоматически на Linux (Ubuntu/Debian/RHEL):**

```bash
# 1. Скопируйте data/store.json на сервер (если ещё нет)
# 2. Из корня репозитория:
sudo bash scripts/setup-mysql-linux.sh
# или со своим паролем:
sudo MYSQL_PASSWORD='секрет' bash scripts/setup-mysql-linux.sh
npm run api
```

Скрипт: ставит `mysql-server` (если нет), создаёт БД/пользователя, пишет `server-config.json` (`storage: mysql`), делает `npm run migrate:mysql`.

**Вручную:**

1. Установите MySQL 8+, создайте пользователя (или используйте `root`).
2. В `server-config.json` заполните блок `mysql` (см. `server/config/server-config.example.json`).
3. Остановите API.
4. `npm run migrate:mysql` — переносит текущий `data/store.json`.
5. По желанию: `npm run test:mysql-parity -- --org wew` (или id org).
6. Установите `"storage": "mysql"`, запустите `npm run api`.
7. Smoke: логин, карта, site-admin, чат.

Откат: `"storage": "json"`, восстановите `store.json` из `data/backups/full/store-….json`.

### Работа без API

Карта **не работает** без `npm run api`: нет загрузки карты организации, синхронизации и ключей с `/api/public-config`.

## Отладка синхронизации

- WebSocket: `ws://localhost:3000/sync` (тот же хост, что и страница)
- В UI: блок «Синхронизация» → «Подключиться»
- Операции: `type: 'op'`; полное состояние: `type: 'state'` (debounce на клиенте)

## Производительность больших карт

См. [FRONTEND.md](FRONTEND.md#производительность-карты) — индекс объектов, viewport, инкрементальные линии связи.
