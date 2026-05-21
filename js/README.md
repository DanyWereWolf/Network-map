# Модули приложения (js/)

Скрипты подключаются в `index.html` и `auth.html` в указанном порядке.

| Путь | Назначение |
|------|------------|
| **core/state.js** | Глобальные переменные: myMap, objects, selectedObjects, isEditMode и др. |
| **core/config.js** | Версия (APP_VERSION), репозиторий (GITHUB_REPO), getApiBase() |
| **core/utils.js** | escapeHtml(), getObjectTypeName() |
| **core/notifications.js** | showToast(), showSuccess(), showError(), showInfo() |
| **core/confirm-dialog.js** | showConfirm() |
| **core/network-status.js** | showNetworkError(), hideNetworkError() |
| **core/updates.js** | checkForUpdates(), openUpdatesModal() |
| **core/cookie-consent.js** | Согласие на cookies (лендинг и приложение) |
| **core/maintenance-notice.js** | Баннер техработ с сервера |
| **groups.js** | Группы кроссов/узлов |
| **catalog/device-catalog.js** | Справочник устройств |
| **map/theme.js** | Тема интерфейса и карты |
| **map/search.js** | Поиск объектов на карте |
| **ui/help.js** | Модальное окно справки |
| **history.js** | Журнал изменений |
| **sync.js** | WebSocket-синхронизация, курсоры |

Версию перед релизом синхронно меняют в **core/config.js** (`APP_VERSION`), в **package.json** / **package-lock.json** и в **README.md** (раздел «История изменений»).

**auth.html** подключает: `js/core/config.js`, `auth.js`, `cookie-consent.js`, `maintenance-notice.js`.
