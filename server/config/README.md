# Конфигурация сервера

## Файлы

| Файл | Описание |
|------|----------|
| `server-config.example.json` | Шаблон с комментариями по полям (в git) |
| `../../server-config.json` | Рабочий конфиг в **корне репозитория** (не коммитится) |

Сервер (`server-api.js`) читает только `server-config.json` из корня проекта.

## Установка

```bash
cp server/config/server-config.example.json server-config.json
```

Обязательно задайте `yandexMapsApiKey`. Ключи Yandex SmartCaptcha — в [консоли Yandex Cloud](https://console.yandex.cloud/folders?section=smartcaptcha) (бесплатный тариф).

## Поля

| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `port` | `3000` | HTTP-порт |
| `host` | `0.0.0.0` | Интерфейс (доступ из LAN) |
| `yandexMapsApiKey` | — | Ключ Яндекс.Карт |
| `publicSiteUrl` | — | Публичный URL сайта |
| `freeMapObjectLimit` | `2000` | Лимит объектов на карте |
| `maxConcurrentUsers` | `4` | Одновременные пользователи организации |
| `smartCaptchaClientKey` | — | Yandex SmartCaptcha (клиент, `ysc1_…`) |
| `smartCaptchaServerKey` | — | Yandex SmartCaptcha (сервер, `ysc2_…`) |
| `authRateLimitWindowMs` | `900000` | Окно rate limit (15 мин) |
| `authRateLimitMax` | `20` | Попыток входа за окно |

Переопределение через переменные окружения — см. [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).
