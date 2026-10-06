# Импорт проектов NeD (`.ned`)

Конвертер читает бинарный проект **NeD 2.5** (BinaryFormatter + встроенная карта Visio) и пишет JSON-массив в формате Network-map.

## Сборка

Нужен [.NET SDK](https://dotnet.microsoft.com/) 9/10:

```bash
dotnet build tools/ned-import/NedToNetworkMap -c Release
```

## CLI

```bash
dotnet tools/ned-import/NedToNetworkMap/bin/Release/net10.0/NedToNetworkMap.dll "путь\к\проекту.ned" out.json
```

Или через npm:

```bash
npm run ned:convert -- "путь\к\проекту.ned" tools/ned-import/out.json
```

Затем в UI: **Файлы → Импорт** и выбрать `out.json`.

## Импорт из UI

После сборки конвертера API принимает `.ned` напрямую:

1. Войти как администратор организации
2. **Файлы → Импорт** → выбрать `.ned`
3. Сервер вызывает конвертер (`POST /api/import/ned`) и подставляет JSON в карту

Требуется `dotnet` в PATH на машине, где крутится `server-api`.

## Что переносится

| NeD | Network-map |
|-----|-------------|
| `ndCrossingPoint` | `node` |
| `ndCableBox` | `sleeve` |
| `ndOpticCross` | `cross` (свои координаты или точка родителя) |
| `ndSplitter` | `embeddedSplitters[]` внутри родительской муфты/кросса (`splitRatio` из выходов / `1/N`) |
| `ndPillar` | `support` |
| `ndBuilding` | `node` (по адресу) |
| `ndCable` (внешние) | `cable` (отрезок между концами) |
| `ndSimpleWeldNode` | `fiberConnections` на муфте/кроссе |

Имена: адрес, customName, uniqueName, comment, model, localName.

Координаты: Visio → WGS84 по origin/zoom из GIS-настроек проекта.

Полилинии кабелей из Visio пока не разбираются — кабель рисуется как прямая между концами.
