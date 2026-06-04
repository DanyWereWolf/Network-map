# Справочник `public/js/`

Клиентские скрипты без сборщика. Пути в таблицах — относительно корня сайта (`/js/...`).

## Точки входа (`app/`)

| Файл | Назначение |
|------|------------|
| **app/main.js** | Карта: объекты, кабели, кросс/муфта, GPON, регионы, undo, импорт/экспорт, фильтры |
| **app/auth.js** | `AuthSystem`: вход, регистрация, сессия, запросы к `/api/auth/*` |

## Ядро (`core/`)

| Файл | Назначение |
|------|------------|
| **config.js** | `APP_VERSION`, `GITHUB_REPO`, `getApiBase()` |
| **state.js** | Глобалы: `myMap`, `objects`, `isEditMode`, режимы кабеля/региона, undo-стеки |
| **utils.js** | `escapeHtml()`, имена типов объектов |
| **script-loader.js** | Отложенная подгрузка тяжёлых модулей |
| **notifications.js** | Тосты: success, error, info, warning |
| **confirm-dialog.js** | Модальные подтверждения |
| **network-status.js** | Баннер потери сети |
| **updates.js** | Проверка обновлений с GitHub |
| **cookie-consent.js** | Баннер cookies |
| **maintenance-notice.js** | Техработы (с API) |
| **early-access-notice.js** | Ранний доступ |
| **page-bg-plexus.js** | Фон на auth/лендинге |

## Карта (`map/`)

| Файл | Назначение |
|------|------------|
| **theme.js** | Светлая/тёмная тема UI и подложки карты |
| **map-icons.js** | SVG-иконки типов объектов |
| **search.js** | Поиск по карте в шапке |
| **regions.js** | Полигоны регионов, видимость, подсчёт объектов |
| **cable-underground.js** | Подземные участки кабеля (колодцы, pathCoords) |
| **map-perf.js** | Индекс `uniqueId`, viewport cull, планировщик линий связи |

## UI (`ui/`)

| Файл | Назначение |
|------|------------|
| **help.js** | **Справка для пользователей** в шапке карты («Справка по программе»): текст в `getHelpContentHtml()` |
| **camera-player.js** | Просмотр RTSP/снимков камер |
| **modal-glass.js** | Стилизация модальных окон |

## Прочие модули (корень `js/`)

| Файл | Назначение |
|------|------------|
| **sync.js** | WebSocket: state/op, курсоры, блокировки, список «В сети» |
| **groups.js** | Имена групп кроссов/узлов, `groupKey(coords)` |
| **history.js** | Журнал изменений (модалка) |
| **fiber-cable-config.js** | Палитры и конфигурация жил ВОЛС |
| **map-legend.js** | Легенда типов на карте |
| **landing-nav.js** | Меню лендинга |
| **news-page.js** | Страница `news.html` |
| **org-chat.js** | Чат организации в приложении |
| **support-chat.js** | Виджет поддержки на лендинге/auth |

## Каталог и админка

| Файл | Назначение |
|------|------------|
| **catalog/device-catalog.js** | Справочник производителей/моделей |
| **admin/news-editor.js** | Редактор новостей в `site-admin.html` |

## Порядок в `index.html`

```
config → auth → state → utils → script-loader → notifications → confirm → network → updates
→ groups → map/* → fiber-cable-config → map-legend → main → sync
```

Подробнее: [docs/FRONTEND.md](../../docs/FRONTEND.md).

## Версия

Перед релизом обновите `APP_VERSION` здесь, в `package.json` и в [README.md](../../README.md).
