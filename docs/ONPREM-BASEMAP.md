# On-prem: офлайн-подложка (Leaflet + GeoTIFF)

Режим для замкнутого контура: карта объектов на **Leaflet** + локальные XYZ-тайлы из **GeoTIFF** (ортофото). Схема / спутник / гибрид Яндекса работают **отдельным рантаймом** (официальный JS API) — слои не смешиваются на одном canvas; переключение в меню подложки полностью меняет движок.

Облако `volsmap.ru` по умолчанию остаётся на Яндекс.Картах (`mapEngine: "yandex"`).

## Включение

В `server-config.json` (корень репозитория):

```json
{
  "mapEngine": "leaflet",
  "basemapOrgQuotaGb": 50,
  "basemapMaxUploadGb": 8,
  "yandexMapsApiKey": "ваш-ключ"
}
```

Перезапустите API (`npm run api`). Ключ `yandexMapsApiKey` нужен для слоёв Яндекса (схема / спутник / гибрид); для одного только ортофото без интернета — необязателен.

## Зависимости npm (обязательно на сервере)

В корне проекта после распаковки релиза:

```bash
# нужен Node ≥ 20.9 (sharp не ставится на Node 18)
npm install --omit=dev
```

`geotiff` и `sharp` — обычные зависимости из `package.json`. Их **нельзя** скопировать с Windows на Linux: у `sharp` нативные бинарники под ОС. Либо ставите `npm install` на целевой машине, либо собираете zip **уже на Linux** вместе с `node_modules`.

API стартует и без этих пакетов (карта / готовые тайлы работают); без них нельзя только **нарезать новый GeoTIFF** (если нет GDAL).

## Зависимость: GDAL (рекомендуется)

Без GDAL сервер режет тайлы **встроенным движком** (`geotiff` + `sharp`) — на Windows после `npm install` «из коробки», но медленнее и хуже для огромных файлов / редких проекций.

С GDAL нарезка быстрее и надёжнее. В `PATH`:

| Утилита | Назначение |
|---------|------------|
| `gdalinfo` | Чтение bounds / SRS |
| `gdalwarp` | Перепроецирование в EPSG:3857 |
| `gdal2tiles.py` (или `gdal2tiles`) | Нарезка XYZ/TMS тайлов |

### Linux (пример)

```bash
# Debian/Ubuntu
sudo apt-get install -y gdal-bin python3-gdal

# проверка
gdalinfo --version
which gdal2tiles.py || which gdal2tiles
```

### Windows

1. Установите [OSGeo4W](https://www.osgeo.org/projects/osgeo4w/) (пакет GDAL) или GISInternals.
2. Добавьте `C:\OSGeo4W\bin` (или аналог) в системный `PATH`.
3. В новом терминале: `gdalinfo --version`.

Проверка из приложения: после входа админа организации откройте **Слои → Подложка…** — строка «GDAL: готов».

## Загрузка основной карты

1. Войдите как **администратор организации**.
2. **Слои → Подложка…** (или «Ортофото»).
3. Режим «Загрузить основную карту», файл `.tif` / `.tiff` с геопривязкой.
4. При необходимости задайте `minZ` / `maxZ` (по умолчанию 12–20).
5. Дождитесь статуса «Готово» — подложка появится на карте.

JPEG/PNG без координат в v1 **не принимаются**. Нужен GeoTIFF (WGS84 или иной SRS — сервер перепроецирует в Web Mercator).

## Обновление участка

1. Режим «Обновить участок».
2. Загрузите новый GeoTIFF, пересекающийся с уже покрытой зоной.
3. Новые тайлы **перезаписывают** файлы `z/x/y.png` в активном пакете; остальная подложка не трогается.
4. В манифесте пишется запись истории (`updates`: время, bbox, имя файла).

## Хранение на диске

```
data/basemaps/
  {orgId}/
    index.json          # activePackId, список пакетов, история
    {packId}/
      manifest.json
      {z}/{x}/{y}.png
    _inbox/             # временные файлы job
  _tmp/                 # multer upload
```

Бэкап JSON карты (`data/backups/…`) **не** включает тайлы — копируйте `data/basemaps/` отдельно.

## API (кратко)

| Метод | Путь | Кто |
|-------|------|-----|
| GET | `/api/basemap/active` | участник орг. |
| GET | `/api/basemap/tiles/:packId/:z/:x/:y` | участник (Bearer или `?token=`) |
| GET | `/api/basemap/status` | участник |
| GET | `/api/basemap/packs` | участник |
| POST | `/api/basemap/upload` | admin орг. (multipart `file`, `mode=full\|patch`) |
| GET | `/api/basemap/jobs/:jobId` | участник |
| POST | `/api/basemap/:packId/activate` | admin орг. |
| DELETE | `/api/basemap/:packId` | admin орг. |

## Air-gap checklist

- [ ] `mapEngine: "leaflet"` в `server-config.json`
- [ ] GDAL установлен и виден процессу Node
- [ ] В браузере нет запросов к `api-maps.yandex.ru` / `*.yandex.ru` карт
- [ ] Leaflet отдаётся локально: `/vendor/leaflet/*`
- [ ] Загружен хотя бы один GeoTIFF → есть активный pack
- [ ] Объекты сети создаются поверх ортофото
- [ ] Второй GeoTIFF (patch) обновляет только свой bbox
- [ ] Диск и `basemapOrgQuotaGb` достаточны под ортофото

## Ограничения v1

- Один job нарезки обрабатывается последовательно.
- Полный перенос всех тонкостей API Яндекс.Карт не гарантируется: используется совместимый shim на Leaflet.
- PDF-снимок карты, завязанный на Yandex Static Maps, в leaflet-режиме может работать хуже — при необходимости доработайте отдельно.
