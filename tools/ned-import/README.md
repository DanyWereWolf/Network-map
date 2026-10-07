# Импорт проектов NeD (`.ned`)

Конвертер читает бинарный проект **NeD 2.5** (BinaryFormatter + встроенная карта Visio) и пишет JSON-массив в формате Network-map.

## Сборка

Собранный конвертер хранится в репозитории: `tools/ned-import/dist`. После правок в исходниках
пересоберите его ([.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)) и закоммитьте `dist`:

```bash
npm run ned:build
```

Для запуска нужен только .NET Runtime 10. Если на машине с сервером его нет, `server-api`
при старте сам скачивает runtime (~37 МБ) в `tools/.dotnet`; права администратора не нужны.

## CLI

```bash
dotnet tools/ned-import/dist/NedToNetworkMap.dll "путь\к\проекту.ned" out.json
```

Или через npm:

```bash
npm run ned:convert -- "путь\к\проекту.ned" tools/ned-import/out.json
```

Затем в UI: **Файлы → Импорт** и выбрать `out.json`.

## Импорт из UI

API принимает `.ned` напрямую:

1. Войти как администратор организации
2. **Файлы → Импорт** → выбрать `.ned`
3. Сервер вызывает конвертер (`POST /api/import/ned`) и подставляет JSON в карту

.NET Runtime 10 ищется в `tools/.dotnet` и в PATH; если его нет, он скачивается автоматически.

## Что переносится

| NeD | Network-map |
|-----|-------------|
| `ndCrossingPoint` | `node`, если нет муфты/кросса; иначе точка не дублируется |
| `ndCableBox` | `sleeve` |
| `ndOpticCross` | `cross` (свои координаты или точка родителя) |
| `ndSplitter` | `embeddedSplitters[]` на муфте/кроссе; вход/выходы из сварок `_input`/`_outputs` |
| `ndPillar` | `support` |
| `ndBuilding` | `node` (по адресу) |
| `ndCable` (внешние) | `cable` между муфтой/кроссом (не на голый CrossingPoint) |
| `ndSimpleWeldNode` | `fiberConnections` или связь сплиттера (`inputFiber` / `outputConnections`) |

Имена: адрес, customName, uniqueName, comment, model, localName.

Координаты: Visio → WGS84 (эллипсоидальный Mercator как в NeD).

Сверка с картой (нужен интернет, ~20–30 с):
1. Геокодинг адресов зданий через Nominatim (OSM)
2. Подгонка **origin + zoom** (least squares)
3. Здания с адресом — точный snap в точку OSM
4. Остальные объекты — Visio-проекция + локальная поправка по ближайшим адресам
5. Дублирующий «второй слой» Visio отбрасывается

`PrevLon`/`PrevLat` не используются.

Полилинии кабелей из Visio пока не разбираются — кабель рисуется как прямая между концами.
