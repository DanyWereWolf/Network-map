# Конфигурация Portable

Рабочий файл: `server-config.json` в **корне Portable** (рядом с `package.json`), не в этой папке.

При первом запуске `run-api.bat` / `run-api.sh` (или `npm run api`) сами:

1. копируют `server-config.example.json` → `../../server-config.json`;
2. создают `data/` и подкаталоги;
3. печатают логин/пароль bootstrap-админа.

## Подложка карты

`mapEngine: "leaflet"` — dual-режим (рекомендуется для Portable):

- **есть интернет** и задан `yandexMapsApiKey` → Яндекс (схема / спутник / гибрид);
- **нет интернета** (или нет ключа) → ортофото (GeoTIFF), если загружено, иначе пустая подложка.

После первого старта задайте:

- `bootstrapAdminPassword` — смените пароль первого администратора
- `organizationName` — название организации
- `yandexMapsApiKey` — ключ Яндекс.Карт для онлайн-слоёв

## Лицензия Portable

Бессрочная офлайн-лицензия, привязанная к коду машины (без проверок по сети).

Ключ подписи один: `server/config/portable-license-keypair.json` в основной платформе.
Он едет с обновлением кода — site-admin и `npm run release` берут его автоматически (ручная синхронизация на сервере не нужна).

Локальная выдача (тем же ключом):

```bash
# из корня репозитория
node scripts/issue-portable-license.js --pubkey
node scripts/issue-portable-license.js --customer "Клиент" --machine "КОД-МАШИНЫ"
node scripts/issue-portable-license.js --verify path/to/license.json
```

1. В основной платформе: **site-admin → Лицензии Portable** — скопируйте публичный ключ.
2. В `server-config.json` Portable (dev): `portableLicensePublicKey` + `portableLicenseRequired: true`.
3. Клиент: `/license.html` → код машины → вам; в ответ — JSON лицензии → `data/license.json`.

Для разработки оставьте `portableLicenseRequired: false`.

## Релизный пакет для клиента

Из папки `Portable/`:

```bash
npm run release
```

Скрипт:

1. берёт `server/config/portable-license-keypair.json` (тот же, что site-admin);
2. копирует Portable в `releases/network-map-portable-<версия>-<дата>/`;
3. прошивает публичный ключ в код (`EMBEDDED_PUBLIC_KEY`) и в example-конфиг;
4. пишет `INSTALL.md`, `RELEASE.json` (с `license.publicKey`) и zip-архив.

Клиенту — zip; лицензию — из site-admin после деплоя этой же версии кода (или `scripts/issue-portable-license.js`).

Лимиты карты и одновременных сессий в Portable отключены.
