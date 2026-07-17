# Сервер (backend)

Точка входа для разработки и продакшена: **`npm run api`** → `server/server-api.js`.

## Роли процессов

| Файл | Команда | Назначение |
|------|---------|------------|
| `server-api.js` | `npm run api` | HTTP (Express), REST API, WebSocket `/sync`, раздача `public/` |
| `server.js` | `npm run sync` | Упрощённый relay WebSocket без REST и без статики |

В продакшене обычно достаточно одного процесса `server-api.js`.

## Пути на диске

В `server-api.js` заданы:

```text
ROOT_DIR   = <корень репозитория>
PUBLIC_DIR = ROOT_DIR/public
DATA_DIR   = ROOT_DIR/data
```

| Модуль | Каталог данных |
|--------|----------------|
| `database.js` | `data/store.json` (режим `json`) или MySQL (режим `mysql`); бэкапы `data/backups/<orgId>/` |
| `avatars.js` | `data/avatars/` |
| `chat-media.js` | `data/chat-media/` |
| `news-media.js` | `data/news-media/` |

## Конфигурация

Читается `server-config.json` в **корне** репозитория (шаблон: `server/config/server-config.example.json`).

| Поле | Описание |
|------|----------|
| `port`, `host` | HTTP-сервер |
| `yandexMapsApiKey` | Отдаётся клиенту через `/api/public-config` |
| `publicSiteUrl` | Базовый URL для ссылок и SEO |
| `freeMapObjectLimit` | Лимит объектов на карте (бесплатный тариф) |
| `maxConcurrentUsers` | Одновременные сессии организации |
| `storage` | `"json"` или `"mysql"` |
| `mysql` | `{ host, port, user, password, database, connectionLimit }` |
| `turnstileSiteKey`, `turnstileSecretKey` | Cloudflare Turnstile |
| `authRateLimitWindowMs`, `authRateLimitMax` | Лимит попыток входа с IP |

## Статика

```javascript
app.use('/js', express.static(PUBLIC_DIR + '/js', { Content-Type для .js }));
app.use(express.static(PUBLIC_DIR));
```

- Корень сайта `/` → `pricing.html` (редирект/маршрут в `server-api.js`)
- `favicon.ico` → `public/favicon.svg`

## REST API (обзор)

Полный список маршрутов — в `server/server-api.js`. Основные группы:

| Группа | Примеры |
|--------|---------|
| Публичные | `/api/public-config`, новости, витрина тарифов |
| Авторизация | `/api/auth/login`, register, session, 2FA |
| Карта организации | загрузка/сохранение map data, settings, history |
| Пользователи и орг. | CRUD пользователей, лимиты, аватары |
| Админка сайта | организации, глобальные настройки, новости |
| Медиа | загрузка файлов чата и новостей |

Запросы с сессией: заголовок `Authorization: Bearer <token>` или cookie (см. `auth.js`).

## WebSocket `/sync`

- Подключение: тот же host, путь `/sync`
- Сообщения: `hello`, `state`, `op`, `cursor`, `lock_object`, `groupNames`, …
- Состояние карты по организации: `mapDataByOrg` (JSON-файл или сборка из MySQL)
- Операции применяются на сервере (`applyOperationToState`) и рассылаются другим клиентам той же организации
- Конфликты версий: поле `revision` на объектах/кабелях

## Модули `server/lib/`

| Файл | Назначение |
|------|------------|
| `security.js` | Проверка Turnstile, rate limiting, TOTP для 2FA организации |
| `support-bot.js` | Обработка обращений в чат поддержки |

## `database.js`

Хранилище за единым фасадом (`getMapData` / `setMapData` и платформенные CRUD). Режим задаётся в `server-config.json`:

| `storage` | Поведение |
|-----------|-----------|
| `"json"` (по умолчанию) | `data/store.json` |
| `"mysql"` | MySQL: платформа + реляционная карта; клиенту по-прежнему отдаётся собранный JSON |

### MySQL

- Драйвер: `mysql2`, пул в `server/db/mysql.js`
- Схема: `server/db/schema.sql`, миграции: `npm run db:migrate`
- Сборка карты: `server/db/map-assemble.js` (`assembleMapData` / `disassembleMapData`)
- Импорт из JSON: `npm run migrate:mysql` (читает `data/store.json` → таблицы + `org_map_blobs`)
- Паритет JSON↔SQL: `npm run test:mysql-parity -- --org wew`
- Статус: `npm run db:status`
- Бэкап: ежедневные per-org JSON как раньше; полный логический экспорт + опционально `mysqldump`: `npm run backup:mysql -- --dump`
- Restore SQL dump: `npm run restore:mysql -- --dump path/to/file.sql --yes` (API остановлен)

Конфиг:

```json
"storage": "mysql",
"mysql": {
  "host": "127.0.0.1",
  "port": 3306,
  "user": "root",
  "password": "",
  "database": "network_map"
}
```

Переменные окружения: `STORAGE`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.  
`MYSQL_MIRROR_JSON=1` — дополнительно писать `store.json` как зеркало.

Cutover: остановить API → `npm run migrate:mysql` → `"storage": "mysql"` → старт API. Откат: `"storage": "json"` и восстановление `store.json` из `data/backups/full/`.

На Linux одной командой: `sudo bash scripts/setup-mysql-linux.sh` (на Debian ставит MariaDB через `default-mysql-server` / `mariadb-server`, если пакета `mysql-server` нет; пишет конфиг, мигрирует `data/store.json`).

### Админка (`site-admin` → «База данных»)

Только глобальный admin. На вкладке:

| Блок | Действие |
|------|----------|
| Хранилище | Режим `json`/`mysql`, host/user/db (без пароля), связь, версия, миграции, счётчики |
| JSON-снимки | Создать / список / восстановить `store-*.json` |
| MySQL SQL dumps | Создать `mysqldump`, список, восстановить (двойное подтверждение) |

API:

- `GET /api/admin/storage-status`
- `GET|POST /api/admin/store-backups`, `POST …/create`, `POST …/restore`
- `GET /api/admin/mysql-dumps`, `POST …/create`, `POST …/restore` (`confirm: true`)

Общая логика: `server/db/mysql-ops.js`.

### Операции MySQL (Debian / console)

Полный контроль БД через shell (то же, что в админке, плюс прямой `mysql`). По умолчанию MySQL слушает только `127.0.0.1`.

**Первый запуск (cutover):**

```bash
# 1. Остановить API
# 2. Сохранить копию data/store.json
sudo MYSQL_PASSWORD='секрет' bash scripts/setup-mysql-linux.sh
npm run test:mysql-parity -- --org <orgId>
npm run db:status
npm run api   # в логах: «Данные: MySQL»
```

**Сервис:**

```bash
systemctl status mysql
journalctl -u mysql -e
```

**Прямой SQL** (пользователь из `server-config.json`, часто `networkmap`):

```bash
mysql -h 127.0.0.1 -u networkmap -p network_map
```

Полезные запросы:

```sql
SHOW TABLES;
SELECT id, name FROM organizations;
SELECT COUNT(*) AS users FROM users;
SELECT table_name, table_rows
  FROM information_schema.tables
  WHERE table_schema = DATABASE();
SHOW PROCESSLIST;
SELECT * FROM schema_migrations;
```

**Статус / бэкап / restore:**

```bash
npm run db:status
npm run backup:mysql -- --dump
# → data/backups/full/store-mysql-export-….json
# → data/backups/full/mysqldump-network_map-….sql

# Восстановление SQL dump (CLI — лучше остановить API; из site-admin можно «на горячую»):
npm run restore:mysql -- --dump data/backups/full/mysqldump-network_map-….sql --yes
```

Либо через UI: **site-admin → База данных → MySQL SQL dumps**.

**Откат на JSON:** `"storage": "json"` в `server-config.json`, восстановить `data/store.json` из `data/backups/full/store-….json`, запустить API.

- Ежедневные бэкапы карт в `data/backups/<org_id>/backup-YYYY-MM-DD.json`
- Санитизация тел новостей через `news-sanitize.js` + `sanitize-html`

## Безопасность

- Turnstile на login/register
- Лимит попыток auth с IP
- Роли: глобальный admin (`site-admin`), admin организации, user (только просмотр)
- Размер тела запроса и WebSocket ограничены в `server-api.js`
- Секреты только в `server-config.json` (не в git)

## Деплой (кратко)

1. `npm install` (полный — нужен `javascript-obfuscator` для сборки клиента)
2. `npm run build` — копирует `public/` в `dist/` и обфусцирует все JS
3. `server-config.json` на сервере: боевые ключи и `"serveObfuscatedClient": true` (или `SERVE_OBFUSCATED_CLIENT=1`)
4. Процесс-менеджер: `node server/server-api.js` или `npm run api`
5. Reverse proxy (nginx) → HTTPS, при необходимости WebSocket upgrade на `/sync`
6. Каталог `data/` на постоянном томе с бэкапами

Локально без флага раздаётся читаемый `public/` — удобно для отладки. Обфускация усложняет чтение кода в DevTools, но не заменяет серверные секреты и права доступа.

Подробности окружения — у хостинга; структура путей после реорганизации не меняет URL для пользователей.
