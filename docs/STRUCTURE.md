# Структура репозитория

Корень проекта — Node.js-приложение: сервер раздаёт статику из `public/` и обслуживает API из `server/`. Данные runtime лежат в `data/` (не коммитятся).

## Дерево каталогов

```
Network-map/
├── public/                         # Статические файлы (корень сайта для Express)
│   ├── index.html                  # Интерактивная карта (основное приложение)
│   ├── auth.html                   # Вход, регистрация организации, 2FA
│   ├── pricing.html                # Лендинг (маршрут / на сервере)
│   ├── news.html                   # Публичные новости
│   ├── site-admin.html             # Панель глобального администратора
│   ├── checkout.html               # Заглушка оплаты (редирект на контакты)
│   ├── yandex_*.html               # Верификация Яндекс
│   ├── favicon.svg
│   ├── css/                        # Стили по страницам
│   │   ├── styles.css              # Карта (index.html)
│   │   ├── app-mobile.css
│   │   ├── auth.css
│   │   ├── landing.css, landing-header.css, pages-mobile.css
│   │   ├── news.css, site-admin.css
│   │   ├── cookie-consent.css, maintenance-notice.css
│   │   └── support-chat.css
│   ├── icons/                      # PNG/SVG для UI
│   └── js/
│       ├── app/
│       │   ├── main.js             # Логика карты (~основной объём)
│       │   ├── radio-bridge.js     # Wi‑Fi радиомосты (P2P/P2MP, покрытие)
│       │   └── auth.js             # Сессии, вход, API авторизации
│       ├── core/                   # Общие модули клиента
│       ├── map/                    # Карта, регионы, подземные участки, perf
│       ├── ui/                     # Справка, камеры, модалки
│       ├── catalog/                # Справочник устройств
│       ├── admin/                  # Редактор новостей (site-admin)
│       ├── sync.js                 # WebSocket совместной работы
│       ├── groups.js, history.js, …
│       └── README.md               # Справочник модулей
│
├── server/                         # Backend (Node.js)
│   ├── server-api.js               # Express + WebSocket /sync + статика
│   ├── server.js                   # Упрощённый только-WS сервер (npm run sync)
│   ├── database.js                 # JSON store, организации, бэкапы
│   ├── avatars.js                  # Аватары пользователей
│   ├── chat-media.js               # Медиа организационного чата
│   ├── news-media.js               # Медиа новостей
│   ├── news-sanitize.js            # Санитизация HTML новостей
│   ├── lib/
│   │   ├── security.js             # Turnstile, rate limit, TOTP
│   │   └── support-bot.js          # Бот поддержки
│   └── config/
│       └── server-config.example.json
│
├── data/                           # Локальные данные (в .gitignore)
│   ├── store.json                  # Основное хранилище
│   ├── backups/<org_id>/           # Ежедневные бэкапы карт
│   ├── avatars/
│   ├── chat-media/
│   └── news-media/
│
├── scripts/
│   └── check-js-syntax.js          # node --check для всех .js
│
├── docs/                           # Документация (этот каталог)
├── server-config.json              # Рабочий конфиг (в .gitignore)
├── package.json
├── run-api.bat, run-api.sh
├── LICENSE
└── README.md
```

## Страницы (`public/`)

| URL (относительно хоста) | Файл | Назначение |
|--------------------------|------|------------|
| `/` | `pricing.html` | Лендинг, тарифы (задаётся в `server-api.js`) |
| `/index.html` | `index.html` | Карта сети после входа |
| `/auth.html` | `auth.html` | Авторизация и регистрация |
| `/news.html` | `news.html` | Лента новостей |
| `/site-admin.html` | `site-admin.html` | Админка платформы |
| `/checkout.html` | `checkout.html` | Сообщение вместо оплаты |

Сервер монтирует `public/` как корень статики; пути в HTML вида `css/styles.css`, `js/core/config.js` — относительно корня сайта.

## Конфигурация

| Файл | Расположение | В git |
|------|--------------|-------|
| Шаблон | `server/config/server-config.example.json` | Да |
| Рабочий | `server-config.json` (корень репозитория) | Нет |

Сервер читает `server-config.json` из корня (`ROOT_DIR` в `server-api.js`), не из `server/config/`.

## Сборка и артефакты

| Каталог | Назначение |
|---------|------------|
| `node_modules/` | Зависимости npm |
| `dist/` | Обфусцированные `public/js/app/main.js` и `auth.js` после `npm run build` |
