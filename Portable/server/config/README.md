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

**Критично:** один и тот же файл `data/portable-license-keypair.json` должен быть:

- на **машине сборки** zip (`npm run release`);
- на **сервере site-admin**, где выдаёте JSON клиенту.

Иначе клиент увидит «Подпись лицензии недействительна». Сверьте публичный ключ в логе API при старте с `RELEASE.json` → `license.publicKey` в zip.

Локальная выдача (тем же ключом, что в zip), без site-admin:

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

1. берёт (или создаёт) `data/portable-license-keypair.json` в **корне репозитория**;
2. копирует Portable в `releases/network-map-portable-<версия>-<дата>/`;
3. прошивает публичный ключ в код (`EMBEDDED_PUBLIC_KEY`) и в example-конфиг;
4. пишет `INSTALL.md`, `RELEASE.json` (с `license.publicKey`) и zip-архив.

Клиенту отдаёте zip; лицензию — из site-admin **с тем же keypair** (или через `scripts/issue-portable-license.js`).

Лимиты карты и одновременных сессий в Portable отключены.
