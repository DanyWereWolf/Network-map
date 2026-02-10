# Модули приложения (js/)

Скрипты подключаются в `index.html` в указанном порядке.

| Файл | Назначение |
|------|------------|
| **config.js** | Версия (`APP_VERSION`), репозиторий (`GITHUB_REPO`), результат проверки обновлений |
| **utils.js** | `escapeHtml()`, `getObjectTypeName()` |
| **notifications.js** | `showToast()`, `showSuccess()`, `showError()`, `showWarning()`, `showInfo()` |
| **updates.js** | Проверка обновлений: `checkForUpdates()`, `openUpdatesModal()`, `setupUpdatesModalHandlers()` |
| **help.js** | Справка: `openHelpModal()`, `getHelpContentHtml()`, `setupHelpModalHandlers()` |
| **history.js** | История изменений: `ActionTypes`, `logAction()`, `getHistory()`, `openHistoryModal()`, `setupHistoryModalHandlers()` и др. |
| **sync.js** | Синхронизация карты: WebSocket, `syncSendState` / `syncSendOp`, приём состояния и операций, курсоры участников, `updateCollaboratorCursors` |

Версию перед релизом меняют в **config.js** (`APP_VERSION`).
