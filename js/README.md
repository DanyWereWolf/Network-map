# Модули приложения «Карта локальной сети»

Скрипты подключаются в `index.html` в указанном порядке. Общие переменные (например `APP_VERSION`, `currentUser`) задаются в `config.js` или в `main.js`.

| Файл | Назначение |
|------|------------|
| **config.js** | Версия приложения (`APP_VERSION`), репозиторий (`GITHUB_REPO`), результат проверки обновлений (`lastUpdateCheckResult`) |
| **utils.js** | `escapeHtml()`, `getObjectTypeName()` |
| **notifications.js** | `showToast()`, `showSuccess()`, `showError()`, `showWarning()`, `showInfo()` |
| **updates.js** | Проверка обновлений: `checkForUpdates()`, `openUpdatesModal()`, `renderUpdatesModalContent()`, `setupUpdatesModalHandlers()` |
| **help.js** | Справка: `openHelpModal()`, `closeHelpModal()`, `getHelpContentHtml()`, `setupHelpModalHandlers()` |
| **history.js** | История изменений: `ActionTypes`, `logAction()`, `getHistory()`, `openHistoryModal()`, `renderHistoryList()`, `setupHistoryModalHandlers()` и др. |

Версию приложения перед релизом меняют в **config.js** (константа `APP_VERSION`).
