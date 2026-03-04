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
| **core/updates.js** | checkForUpdates(), openUpdatesModal(), setupUpdatesModalHandlers() |
| **groups.js** | Группы кроссов/узлов: groupKey, getCrossGroupName, setCrossGroupName |
| **catalog/device-catalog.js** | Справочник устройств: getDeviceCatalog, комбобоксы, модалка |
| **map/theme.js** | initTheme(), setTheme(), toggleTheme() |
| **map/search.js** | setupMapSearch(), searchObjects(), goToSearchResult() |
| **ui/help.js** | openHelpModal(), getHelpContentHtml(), setupHelpModalHandlers() |
| **history.js** | ActionTypes, logAction(), getHistory(), openHistoryModal(), setupHistoryModalHandlers(), updateHistoryBadge() |
| **sync.js** | WebSocket-синхронизация карты, курсоры участников |

Версию перед релизом меняют в **core/config.js** (`APP_VERSION`).

**auth.html** подключает: js/core/config.js, auth.js
