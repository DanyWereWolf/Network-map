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

1. В основной платформе: **site-admin → Лицензии Portable** — скопируйте публичный ключ.
2. В `server-config.json` Portable:
   - `portableLicensePublicKey` — вставьте ключ;
   - `portableLicenseRequired`: `true` (для продакшена).
3. Откройте `/license.html`, скопируйте **код машины**, передайте поставщику.
4. Вставьте полученный JSON лицензии (или файл) — сохранится в `data/license.json`.

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
4. пишет `INSTALL.md` и zip-архив.

Клиенту отдаёте zip; лицензию выдаёте отдельно в **site-admin → Лицензии Portable** по коду машины с `/license.html`.

Лимиты карты и одновременных сессий в Portable отключены.
