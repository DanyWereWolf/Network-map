# Документация «Карта оптической сети»

Навигация по документам репозитория (версия приложения: **1.2.0**).

| Документ | Для кого | Содержание |
|----------|----------|------------|
| [../README.md](../README.md) | Все | Обзор продукта, возможности, быстрый старт, конфигурация |
| [STRUCTURE.md](STRUCTURE.md) | Разработчики | Дерево каталогов, страницы, данные на диске |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Разработчики | Установка, npm-скрипты, проверки, типичные задачи |
| [FRONTEND.md](FRONTEND.md) | Frontend | Порядок загрузки скриптов, модули, производительность карты |
| [SERVER.md](SERVER.md) | Backend | API, WebSocket, хранилище, медиа, безопасность |
| [../public/js/README.md](../public/js/README.md) | Frontend | Справочник файлов в `public/js/` |
| **В приложении** | Пользователи | Кнопка «Справка» в шапке карты → `public/js/ui/help.js` |

## Быстрые ссылки

- Публичный сервис: [volsmap.ru](https://volsmap.ru/)
- Локально после `npm run api`: [http://localhost:3000](http://localhost:3000)
- Карта приложения: `/index.html`
- Вход: `/auth.html`
- Глобальная админка: `/site-admin.html`
- Шаблон конфига: `server/config/server-config.example.json` → `server-config.json` в **корне** репозитория
