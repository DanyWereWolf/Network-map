# Справочник `public/js/`

Клиентские скрипты без сборщика. Пути в таблицах — относительно корня сайта (`/js/...`).

## Точки входа (`app/`)

Логика карты разбита на модули (подключаются из `index.html` до `main.js`). Ключевые:

| Файл | Назначение |
|------|------------|
| **app/main.js** | Сборка UI/режимов, фильтры, часть оркестрации |
| **app/map-persistence.js** | Сериализация, `saveData`, undo, инкрементальный патч снимка, `warmMapEditCaches` |
| **app/object-sync.js** | Sync ops, `finalizeMapObjectDragEnd`, locks при drag |
| **app/map-selection.js** | Выделение, `scheduleDragUpdate` (лёгкий per-frame drag) |
| **app/create-object.js** / **object-placement.js** | Создание и размещение объектов |
| **app/cable-helpers.js** / **cable-routing.js** | Кабели, light/full update, attach к трассе |
| **app/connection-lines.js** | GPON-линии, nudge по индексу uid |
| **app/cross-node-display.js** | Группы кроссов/узлов (в т.ч. лёгкий group-dragend) |
| **app/radio-bridge.js** | Wi‑Fi радиомосты: P2P/P2MP, радиолинки, порты RJ45/SFP, зоны покрытия, карточка |
| **app/auth.js** | `AuthSystem`: вход, регистрация, сессия, запросы к `/api/auth/*` |
| **app/basemap-ui.js** | Загрузка/обновление ортофото (GeoTIFF) в leaflet-режиме |

Производительность move/place: [docs/FRONTEND.md](../../docs/FRONTEND.md#производительность-карты).

## Ядро (`core/`)

| Файл | Назначение |
|------|------------|
| **config.js** | `APP_VERSION`, `getApiBase()` |
| **state.js** | Глобалы: `myMap`, `objects`, `isEditMode`, режимы кабеля/региона, undo-стеки |
| **utils.js** | `escapeHtml()`, имена типов объектов |
| **script-loader.js** | Отложенная подгрузка тяжёлых модулей |
| **notifications.js** | Тосты: success, error, info, warning |
| **confirm-dialog.js** | Модальные подтверждения |
| **network-status.js** | Баннер потери сети |
| **cookie-consent.js** | Баннер cookies |
| **maintenance-notice.js** | Техработы (с API) |
| **page-bg-plexus.js** | Фон на auth/лендинге |

## Карта (`map/`)

| Файл | Назначение |
|------|------------|
| **map-engine.js** | Переключатель `yandex` / `leaflet` (`MapEngine`) |
| **leaflet-ymaps-shim.js** | YMaps-совместимый слой поверх Leaflet (on-prem) |
| **theme.js** | Светлая/тёмная тема UI и подложки карты |
| **map-icons.js** | SVG-иконки типов объектов |
| **search.js** | Поиск по карте в шапке |
| **regions.js** | Полигоны регионов, видимость, подсчёт объектов |
| **cable-underground.js** | Подземные участки кабеля (колодцы, pathCoords) |
| **map-perf.js** | Индекс `uniqueId`, reverse cable links, spatial grid, viewport cull / виртуализация, планировщик линий связи |

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
| **fiber-cable-config.js** | Палитры и конфигурация волокон ВОЛС |
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
config → auth → state → utils → script-loader → notifications → confirm → network
→ groups → map/* → fiber-cable-config → map-legend → main → radio-bridge → sync
```

Подробнее: [docs/FRONTEND.md](../../docs/FRONTEND.md).

## Версия

Перед релизом обновите `APP_VERSION` здесь, в `package.json` и в [README.md](../../README.md).
