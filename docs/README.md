# Документация «Карта оптической сети»

Навигация по документам репозитория (версия приложения: **1.2.0**).

| Документ | Для кого | Содержание |
|----------|----------|------------|
| [../README.md](../README.md) | Все | Обзор продукта, возможности, быстрый старт, конфигурация |
| [STRUCTURE.md](STRUCTURE.md) | Разработчики | Дерево каталогов, Portable, данные на диске |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Разработчики | Установка (Node ≥ 20.9), npm-скрипты, MySQL, проверки |
| [FRONTEND.md](FRONTEND.md) | Frontend | Скрипты, perf, подземка/колодцы, Leaflet |
| [SERVER.md](SERVER.md) | Backend | API, WebSocket, JSON/MySQL, медиа, безопасность |
| [ONPREM-BASEMAP.md](ONPREM-BASEMAP.md) | On-prem | Leaflet + GeoTIFF→тайлы, GDAL, air-gap |
| [../Portable/README.md](../Portable/README.md) | On-prem | Portable: отличия, bootstrap, лицензия, release |
| [../Portable/INSTALL.md](../Portable/INSTALL.md) | Заказчик | Установка Portable с нуля |
| [../public/js/README.md](../public/js/README.md) | Frontend | Справочник файлов в `public/js/` |
| **В приложении** | Пользователи | Кнопка «Справка» → `public/js/ui/help.js` (в Portable — адаптированная копия) |

## Быстрые ссылки

- Публичный сервис: [volsmap.ru](https://volsmap.ru/)
- Локально после `npm run api`: [http://localhost:3000](http://localhost:3000)
- Карта приложения: `/index.html`
- Вход: `/auth.html`
- Глобальная админка: `/site-admin.html`
- Шаблон конфига: `server/config/server-config.example.json` → `server-config.json` в **корне** репозитория
- Portable после `cd Portable && npm run api`: тот же порт; клиентский zip — `releases/network-map-portable-*.zip`
