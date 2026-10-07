using System.Formats.Nrbf;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using NedToNetworkMap;

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: NedToNetworkMap <file.ned> [output.json] [--stats]");
    return 1;
}

string nedPath = args[0];
bool statsOnly = args.Any(a => a == "--stats");
string outPath = args.Skip(1).FirstOrDefault(a => !a.StartsWith("--"))
    ?? Path.ChangeExtension(nedPath, ".network-map.json");

static int Rid(SerializationRecord r) => RuntimeHelpers.GetHashCode(r);

Console.WriteLine($"Reading {nedPath}...");
using var fs = File.OpenRead(nedPath);
var header = new byte[48];
if (fs.Read(header, 0, 48) != 48) throw new Exception("Invalid .ned header");

long projectLength = BitConverter.ToInt64(header, 24);
long mapLength = BitConverter.ToInt64(header, 40);
Console.WriteLine($"Project stream: {projectLength:N0} bytes; Visio map: {mapLength:N0} bytes");

fs.Position = BitConverter.ToInt64(header, 16);
using var projectStream = new LimitedReadStream(fs, projectLength);
Console.WriteLine("Decoding BinaryFormatter (NRBF)...");
var root = NrbfDecoder.DecodeClassRecord(projectStream)
    ?? throw new Exception("Root is not a class record");

var byId = new Dictionary<int, ClassRecord>();
NrbfWalk.Collect(root, byId);
Console.WriteLine($"Class records: {byId.Count:N0}");

var byType = byId.Values
    .GroupBy(NrbfWalk.TypeTail)
    .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.Ordinal);

void Count(string name) =>
    Console.WriteLine($"  {name}: {(byType.TryGetValue(name, out var l) ? l.Count : 0)}");

Console.WriteLine("Objects:");
foreach (var n in new[] {
    "ndCrossingPoint", "ndCable", "ndCableBox", "ndOpticCross", "ndSimpleWeldNode",
    "ndSignalMedium", "ndPillar", "ndSplitter", "ndSettings", "osmNode", "osmToVisioConverterResult"
}) Count(n);

if (args.Contains("--geodebug"))
{
    double dbgLon = 0, dbgLat = 0, dbgZx = 0.009, dbgZy = 0.009;
    foreach (var settings in byType.GetValueOrDefault("ndSettings") ?? [])
    {
        var gisSettingsObj = NrbfWalk.TryGetClass(settings, "_gisConverterSettings");
        string? gisXml = gisSettingsObj != null ? NrbfWalk.TryGetString(gisSettingsObj, "_value") : null;
        if (!string.IsNullOrEmpty(gisXml))
        {
            var parsed = NrbfWalk.ParseGisSettings(gisXml);
            dbgZx = parsed.ZoomX; dbgZy = parsed.ZoomY;
            if (parsed.ManualOriginLat != 0 || parsed.ManualOriginLon != 0)
            { dbgLat = parsed.ManualOriginLat; dbgLon = parsed.ManualOriginLon; }
        }
        var result = NrbfWalk.TryGetClass(settings, "__osmToVisioConverterResult");
        var origin = result != null ? NrbfWalk.TryGetClass(result, "_originNode") : null;
        if (origin != null)
        {
            double? lat = NrbfWalk.TryGetDouble(origin, "_lat");
            double? lon = NrbfWalk.TryGetDouble(origin, "_lon");
            if ((lat is not null and not 0) || (lon is not null and not 0))
            { dbgLat = lat ?? 0; dbgLon = lon ?? 0; }
        }
    }
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"geodebug origin=({dbgLat:F7},{dbgLon:F7}) zoom=({dbgZx},{dbgZy})"));
    double minX = double.MaxValue, maxX = double.MinValue, minY = double.MaxValue, maxY = double.MinValue;
    int nPts = 0;
    foreach (var cr in byId.Values)
    {
        string t = NrbfWalk.TypeTail(cr);
        if (t is not ("ndCrossingPoint" or "ndBuilding" or "ndCableBox" or "ndCableBoxY"
            or "ndOpticCross" or "ndOpticCrossB" or "ndPillar")) continue;
        double? x = NrbfWalk.TryGetX(cr);
        double? y = NrbfWalk.TryGetY(cr);
        if (x is null || y is null) continue;
        nPts++;
        minX = Math.Min(minX, x.Value); maxX = Math.Max(maxX, x.Value);
        minY = Math.Min(minY, y.Value); maxY = Math.Max(maxY, y.Value);
        string name = NrbfWalk.DisplayName(cr, t);
        bool interesting = name.Contains("молком", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Черкес", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Железнодор", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Политех", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Wildberries", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Fix Price", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Пятероч", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Пятёроч", StringComparison.OrdinalIgnoreCase)
            || name.Contains("Транспортн", StringComparison.OrdinalIgnoreCase);
        if (!interesting) continue;
        var (lat, lon) = Mercator.VisioToLatLon(x.Value, y.Value, dbgLon, dbgLat, dbgZx, dbgZy);
        Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
            $"  {t} vis=({x.Value:F4},{y.Value:F4}) -> ({lat:F6},{lon:F6}) {name[..Math.Min(80, name.Length)]}"));
    }
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"visio bbox: n={nPts} x=[{minX:F3}..{maxX:F3}] y=[{minY:F3}..{maxY:F3}]"));
    var a = Mercator.VisioToLatLon(minX, minY, dbgLon, dbgLat, dbgZx, dbgZy);
    var b = Mercator.VisioToLatLon(maxX, maxY, dbgLon, dbgLat, dbgZx, dbgZy);
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"geo span with current zoom: lat[{a.lat:F5}..{b.lat:F5}] lon[{a.lon:F5}..{b.lon:F5}]"));
    // Implied zoom if Visio extent should map to ~Maykop city (~0.12° ≈ 10–13 km)
    double targetLonSpan = 0.12;
    double mercLon = Mercator.LonToX(dbgLon + targetLonSpan) - Mercator.LonToX(dbgLon);
    double impliedZx = (maxX - minX) / mercLon;
    double mercLat = Mercator.LatToY(dbgLat + targetLonSpan) - Mercator.LatToY(dbgLat);
    double impliedZy = (maxY - minY) / mercLat;
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"implied zoom for ~0.12° city: zx={impliedZx} zy={impliedZy}"));
    var a2 = Mercator.VisioToLatLon(minX, minY, dbgLon, dbgLat, impliedZx, impliedZy);
    var b2 = Mercator.VisioToLatLon(maxX, maxY, dbgLon, dbgLat, impliedZx, impliedZy);
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"geo span with implied zoom: lat[{a2.lat:F5}..{b2.lat:F5}] lon[{a2.lon:F5}..{b2.lon:F5}]"));

    // Sample osmWayConverted: OSM way id + Visio FirstPoint
    int waySamples = 0;
    foreach (var cr in byId.Values)
    {
        if (NrbfWalk.TypeTail(cr) != "osmWayConverted") continue;
        int? id = NrbfWalk.TryGetInt32(cr, "Id") ?? NrbfWalk.TryGetInt32(cr, "<Id>k__BackingField");
        double? fx = NrbfWalk.TryGetDouble(cr, "FirstPointX") ?? NrbfWalk.TryGetDouble(cr, "<FirstPointX>k__BackingField");
        double? fy = NrbfWalk.TryGetDouble(cr, "FirstPointY") ?? NrbfWalk.TryGetDouble(cr, "<FirstPointY>k__BackingField");
        // also try private-style if serialized as fields
        id ??= NrbfWalk.TryGetInt32(cr, "_id");
        fx ??= NrbfWalk.TryGetDouble(cr, "_firstPointX");
        fy ??= NrbfWalk.TryGetDouble(cr, "_firstPointY");
        if (id is null || fx is null || fy is null) continue;
        if (waySamples < 15)
            Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                $"  way id={id} first=({fx.Value:F4},{fy.Value:F4}) members=[{string.Join(',', cr.MemberNames.Take(12))}]"));
        waySamples++;
    }
    Console.WriteLine($"osmWayConverted samples total readable: {waySamples}");
    var waysOut = new List<string> { "id,fx,fy" };
    var fxBuckets = new int[20];
    foreach (var cr in byId.Values)
    {
        if (NrbfWalk.TypeTail(cr) != "osmWayConverted") continue;
        int? id = NrbfWalk.TryGetInt32(cr, "Id");
        double? fx = NrbfWalk.TryGetDouble(cr, "FirstPointX");
        double? fy = NrbfWalk.TryGetDouble(cr, "FirstPointY");
        if (id is null || fx is null || fy is null) continue;
        waysOut.Add(string.Create(CultureInfo.InvariantCulture, $"{id},{fx.Value},{fy.Value}"));
        int bucket = (int)Math.Clamp(Math.Floor((fx.Value + 50) / 20.0), 0, 19);
        fxBuckets[bucket]++;
    }
    Directory.CreateDirectory("tools/ned-import/out");
    File.WriteAllLines("tools/ned-import/out/ways.csv", waysOut);
    Console.WriteLine($"Wrote {waysOut.Count - 1} ways to tools/ned-import/out/ways.csv");
    for (int i = 0; i < fxBuckets.Length; i++)
        if (fxBuckets[i] > 0)
            Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                $"  fx bucket [{i * 20 - 50}..{i * 20 - 30}): {fxBuckets[i]}"));
    foreach (var cr in byId.Values.Where(x => NrbfWalk.TypeTail(x) == "osmNode").Take(5))
    {
        Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
            $"  osmNode lat={NrbfWalk.TryGetDouble(cr, "_lat")} lon={NrbfWalk.TryGetDouble(cr, "_lon")} id={NrbfWalk.TryGetInt64(cr, "_id")} members=[{string.Join(',', cr.MemberNames)}]"));
    }
    return 0;
}

if (args.Contains("--dump"))
{
    void Dump(ClassRecord cr, string title)
    {
        Console.WriteLine($"\n=== {title} ({NrbfWalk.TypeTail(cr)}) members ===");
        foreach (var m in cr.MemberNames)
        {
            if (!cr.HasMember(m)) continue;
            try
            {
                var child = cr.GetSerializationRecord(m);
                if (child is ClassRecord ccr)
                    Console.WriteLine($"  {m}: class {NrbfWalk.TypeTail(ccr)} _id={NrbfWalk.TryGetInt64(ccr, "_id")}");
                else if (child is ArrayRecord) Console.WriteLine($"  {m}: array");
                else if (child is null) Console.WriteLine($"  {m}: null");
                else Console.WriteLine($"  {m}: {child.GetType().Name}");
            }
            catch
            {
                try { var raw = cr.GetRawValue(m); Console.WriteLine($"  {m}: {raw} ({raw?.GetType().Name})"); }
                catch (Exception ex) { Console.WriteLine($"  {m}: ERR {ex.Message}"); }
            }
        }
    }

    foreach (var c in byId.Values.Where(x => NrbfWalk.TypeTail(x) == "ndCable").Take(8))
    {
        Dump(c, "cable");
        Console.WriteLine($"  ends first={NrbfWalk.TryGetClass(c, "_firstCrossingPoint") != null} second={NrbfWalk.TryGetClass(c, "_secondCrossingPoint") != null} a={NrbfWalk.TryGetClass(c, "_aSideContainer") != null} b={NrbfWalk.TryGetClass(c, "_bSideContainer") != null} inner={NrbfWalk.TryGetInt32(c, "_isCableInner")}");
    }
    foreach (var cp in byId.Values.Where(x => NrbfWalk.TypeTail(x) == "ndCrossingPoint").Take(3))
    {
        Dump(cp, "crossing");
        int n = 0;
        foreach (var ch in NrbfWalk.EnumerateListItems(NrbfWalk.TryGetClass(cp, "_subDevices")))
        {
            Console.WriteLine($"   sub[{n++}] {NrbfWalk.TypeTail(ch)}");
            if (n > 12) break;
        }
        Console.WriteLine($"  enumerated subs={n}");
    }
    foreach (var box in byId.Values.Where(x => NrbfWalk.TypeTail(x) == "ndCableBox").Take(2))
    {
        Dump(box, "box");
    }
    return 0;
}

if (statsOnly) return 0;

// --- GIS origin / zoom ---
// В NeD Visio-координаты считаются от OriginNode (osmToVisioConverterResult),
// либо от ManualOrigin только если ManualSetupOriginNode=true.
// PrevLon/PrevLat — это позиция UI при загрузке OSM, НЕ начало проекции.
double originLon = 0, originLat = 0, zoomX = 0.009, zoomY = 0.009;
string originSource = "none";
double? originNodeLon = null, originNodeLat = null;
double manualLon = 0, manualLat = 0;
bool manualSetup = false;

if (byType.TryGetValue("ndSettings", out var settingsList))
{
    foreach (var settings in settingsList)
    {
        var gisSettingsObj = NrbfWalk.TryGetClass(settings, "_gisConverterSettings");
        string? gisXml = gisSettingsObj != null
            ? NrbfWalk.TryGetString(gisSettingsObj, "_value")
            : null;
        if (!string.IsNullOrEmpty(gisXml))
        {
            var parsed = NrbfWalk.ParseGisSettings(gisXml);
            zoomX = parsed.ZoomX;
            zoomY = parsed.ZoomY;
            manualLon = parsed.ManualOriginLon;
            manualLat = parsed.ManualOriginLat;
            manualSetup = parsed.ManualSetupOriginNode;
            Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                $"GIS xml: zoom=({zoomX}, {zoomY}) manualSetup={manualSetup} manualOrigin=({manualLat:F7}, {manualLon:F7}) prev=({parsed.PrevLat:F7}, {parsed.PrevLon:F7})"));
        }

        var result = NrbfWalk.TryGetClass(settings, "__osmToVisioConverterResult")
            ?? NrbfWalk.TryGetClass(settings, "osmToVisioConverterResult")
            ?? NrbfWalk.TryGetClass(settings, "_osmToVisioConverterResult");
        if (result != null)
        {
            // osmNode — struct; в NRBF обычно ClassRecord с _lat/_lon
            var origin = NrbfWalk.TryGetClass(result, "_originNode")
                ?? NrbfWalk.TryGetClass(result, "OriginNode");
            double? lat = origin != null ? NrbfWalk.TryGetDouble(origin, "_lat") : null;
            double? lon = origin != null ? NrbfWalk.TryGetDouble(origin, "_lon") : null;
            lat ??= NrbfWalk.TryGetDouble(result, "_originNode+_lat");
            lon ??= NrbfWalk.TryGetDouble(result, "_originNode+_lon");
            if ((lat is not null and not 0) || (lon is not null and not 0))
            {
                originNodeLat = lat ?? 0;
                originNodeLon = lon ?? 0;
                Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                    $"OriginNode from project: ({originNodeLat:F7}, {originNodeLon:F7})"));
            }
            else
            {
                Console.WriteLine("OriginNode present but lat/lon empty or unreadable.");
            }
        }
    }
}

// Приоритет как в NeD writeToVisioFile / MapTools:
// 1) OriginNode (фактически использованный при построении карты)
// 2) ManualOrigin только при ManualSetupOriginNode
// PrevLon/PrevLat намеренно НЕ используем.
if (originNodeLat is not null && originNodeLon is not null
    && (originNodeLat != 0 || originNodeLon != 0))
{
    originLat = originNodeLat.Value;
    originLon = originNodeLon.Value;
    originSource = "OriginNode";
}
else if (manualSetup && (manualLat != 0 || manualLon != 0))
{
    originLat = manualLat;
    originLon = manualLon;
    originSource = "ManualOrigin";
}
else if (manualLat != 0 || manualLon != 0)
{
    // ManualSetup выключен, но координаты заполнены — запасной вариант
    originLat = manualLat;
    originLon = manualLon;
    originSource = "ManualOrigin(fallback)";
}

if (originLat == 0 && originLon == 0)
    Console.WriteLine("WARNING: GIS origin not found — coordinates may be wrong.");
else
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"Using projection origin [{originSource}]: ({originLat:F7}, {originLon:F7}) zoom=({zoomX}, {zoomY})"));

// Имена+Visio для калибровки и фильтра второго слоя страницы (дубли GIS/сети).
var namedVisio = new List<(double x, double y, string name)>();
foreach (var cr in byId.Values)
{
    string t = NrbfWalk.TypeTail(cr);
    if (t is not ("ndCrossingPoint" or "ndBuilding" or "ndCableBox" or "ndCableBoxY"
        or "ndOpticCross" or "ndOpticCrossB")) continue;
    double? vx = NrbfWalk.TryGetX(cr);
    double? vy = NrbfWalk.TryGetY(cr);
    if (vx is null || vy is null) continue;
    namedVisio.Add((vx.Value, vy.Value, NrbfWalk.DisplayName(cr, t)));
}
var (visMedX, visMedY) = GeoCalibrate.PrimaryVisioMedian(namedVisio.Select(p => (p.x, p.y)));
Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
    $"Primary Visio cluster median=({visMedX:F2},{visMedY:F2}); named={namedVisio.Count}"));

// Сверка с картой: geocode → origin+zoom + snap зданий + локальная поправка.
var addressSnaps = new Dictionary<string, (double lat, double lon)>(StringComparer.OrdinalIgnoreCase);
var mapControls = new List<GeoCalibrate.ControlPoint>();
if (originLat != 0 || originLon != 0)
{
    // Сначала город по координатам OriginNode — надёжнее, чем _townsList.
    string? cityHint = GeoCalibrate.GuessCityFromOrigin(originLat, originLon);
    if (cityHint is null && byType.TryGetValue("ndSettings", out var stForTown))
    {
        foreach (var st in stForTown)
        {
            string? towns = NrbfWalk.TryGetString(st, "_townsList");
            if (string.IsNullOrWhiteSpace(towns)) continue;
            string first = towns.Split(';')[0].Split(',')[0].Trim();
            if (first.Length >= 2 && first.Any(ch => ch >= 'А' && ch <= 'я'))
            { cityHint = first; break; }
        }
    }
    Console.WriteLine("Calibrating against map via address geocoding (may take ~20–30s)...");
    var cal = GeoCalibrate.Calibrate(namedVisio, zoomX, zoomY, originLat, originLon, cityHint);
    if (cal.Ok)
    {
        Console.WriteLine($"Calibration OK: {cal.Report}");
        Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
            $"Projection: origin ({originLat:F7},{originLon:F7}) zoom ({zoomX},{zoomY}) → " +
            $"({cal.OriginLat:F7},{cal.OriginLon:F7}) zoom ({cal.ZoomX:F5},{cal.ZoomY:F5})"));
        originLat = cal.OriginLat;
        originLon = cal.OriginLon;
        zoomX = cal.ZoomX;
        zoomY = cal.ZoomY;
        originSource = "MapAddressFit";
        foreach (var kv in cal.AddressSnaps)
            addressSnaps[kv.Key] = kv.Value;
        mapControls.AddRange(cal.Controls);
    }
    else
        Console.WriteLine($"Calibration skipped: {cal.Report}");
}

(double lat, double lon) ToGeo(double x, double y)
{
    var (plat, plon) = Mercator.VisioToLatLon(x, y, originLon, originLat, zoomX, zoomY);
    return GeoCalibrate.ApplyLocalCorrection(x, y, plat, plon, mapControls, originLon, originLat, zoomX, zoomY);
}

bool InPrimaryVisioLayer(double x, double y) =>
    GeoCalibrate.IsPrimaryVisioLayer(x, y, visMedX, visMedY);

string Uid(string prefix, ClassRecord cr)
{
    // NeD _id часто -1/0 у многих объектов — без Rid будут коллизии uid.
    long id = NrbfWalk.TryGetId(cr) ?? 0;
    int rid = Rid(cr);
    if (id <= 0) return $"{prefix}-r{rid}";
    return $"{prefix}-{id}-r{rid}";
}

bool LooksLikeRealCable(ClassRecord c) =>
    c.HasMember("_firstCrossingPoint") || c.HasMember("_shapeId") || c.HasMember("_fibers");

var crossingByRec = new Dictionary<int, ClassRecord>();
if (byType.TryGetValue("ndCrossingPoint", out var crossings))
    foreach (var c in crossings) crossingByRec[Rid(c)] = c;

var cableByRec = new Dictionary<int, ClassRecord>();
if (byType.TryGetValue("ndCable", out var cables))
    foreach (var c in cables)
        if (LooksLikeRealCable(c)) cableByRec[Rid(c)] = c;

// Fiber → (cableUid, fiberNumber 1-based)
var fiberIndex = new Dictionary<int, (string cableUid, int fiberNum)>();
var cableUidToRec = new Dictionary<string, ClassRecord>(StringComparer.Ordinal);
foreach (var cable in cableByRec.Values)
{
    string cableUid = Uid("cable", cable);
    cableUidToRec[cableUid] = cable;
    var fibersList = NrbfWalk.TryGetClass(cable, "_fibers");
    int n = 0;
    foreach (var fiber in NrbfWalk.EnumerateListItems(fibersList))
    {
        if (NrbfWalk.TypeTail(fiber) != "ndSignalMedium") continue;
        n++;
        fiberIndex[Rid(fiber)] = (cableUid, n);
    }
}
Console.WriteLine($"Indexed fibers: {fiberIndex.Count}");

var pointGeo = new Dictionary<int, (double lat, double lon, string name, string uid)>();

int pointsSkippedSecondaryLayer = 0, pointsSnappedToMap = 0;
void RegisterPoint(ClassRecord obj, string defaultPrefix)
{
    double? x = NrbfWalk.TryGetX(obj);
    double? y = NrbfWalk.TryGetY(obj);
    if (x is null || y is null) return;
    // Второй слой Visio (старый GIS/дубли сети) — не импортируем
    if (!InPrimaryVisioLayer(x.Value, y.Value))
    {
        pointsSkippedSecondaryLayer++;
        return;
    }
    string name = NrbfWalk.DisplayName(obj, defaultPrefix);
    double lat, lon;
    string? addrKey = GeoCalibrate.TryParseAddrKey(name);
    if (addrKey != null && addressSnaps.TryGetValue(addrKey, out var snap))
    {
        (lat, lon) = snap;
        pointsSnappedToMap++;
    }
    else
        (lat, lon) = ToGeo(x.Value, y.Value);
    pointGeo[Rid(obj)] = (lat, lon, name, Uid("obj", obj));
}

foreach (var cp in crossingByRec.Values)
    RegisterPoint(cp, "Узел");
foreach (var box in (byType.GetValueOrDefault("ndCableBox") ?? []).Concat(byType.GetValueOrDefault("ndCableBoxY") ?? []))
    RegisterPoint(box, "Муфта");
foreach (var ox in (byType.GetValueOrDefault("ndOpticCross") ?? []).Concat(byType.GetValueOrDefault("ndOpticCrossB") ?? []))
    RegisterPoint(ox, "Кросс");
foreach (var pillar in byType.GetValueOrDefault("ndPillar") ?? [])
    RegisterPoint(pillar, "Опора");
foreach (var building in byType.GetValueOrDefault("ndBuilding") ?? [])
    RegisterPoint(building, "Здание");
Console.WriteLine($"Points with coordinates: {pointGeo.Count}, skipped secondary Visio layer: {pointsSkippedSecondaryLayer}, snapped to map: {pointsSnappedToMap}");

// device → crossing (deep walk via subDevices + parentDevice)
var deviceToCrossing = new Dictionary<int, int>();

void LinkDevices(ClassRecord parent, int cpId, int depth)
{
    if (depth > 8) return;
    var sub = NrbfWalk.TryGetSubDevices(parent);
    foreach (var child in NrbfWalk.EnumerateListItems(sub))
    {
        int childId = Rid(child);
        deviceToCrossing.TryAdd(childId, cpId);
        LinkDevices(child, cpId, depth + 1);
    }
}

foreach (var cp in crossingByRec.Values)
    LinkDevices(cp, Rid(cp), 0);

// Also climb parentDevice from every box/cross
foreach (var box in (byType.GetValueOrDefault("ndCableBox") ?? [])
    .Concat(byType.GetValueOrDefault("ndCableBoxY") ?? [])
    .Concat(byType.GetValueOrDefault("ndOpticCross") ?? [])
    .Concat(byType.GetValueOrDefault("ndOpticCrossB") ?? [])
    .Concat(byType.GetValueOrDefault("ndBox") ?? [])
    .Concat(byType.GetValueOrDefault("ndBoxA") ?? []))
{
    int id = Rid(box);
    if (deviceToCrossing.ContainsKey(id)) continue;
    var anc = NrbfWalk.FindAncestorCrossing(box);
    if (anc != null) deviceToCrossing[id] = Rid(anc);
}

int boxesLinked = 0, crossesLinked = 0;
foreach (var box in (byType.GetValueOrDefault("ndCableBox") ?? []).Concat(byType.GetValueOrDefault("ndCableBoxY") ?? []))
    if (deviceToCrossing.ContainsKey(Rid(box))) boxesLinked++;
foreach (var ox in (byType.GetValueOrDefault("ndOpticCross") ?? []).Concat(byType.GetValueOrDefault("ndOpticCrossB") ?? []))
    if (deviceToCrossing.ContainsKey(Rid(ox))) crossesLinked++;
Console.WriteLine($"Devices linked to CP: boxes={boxesLinked}, opticCross={crossesLinked}");

var boxIds = new HashSet<int>();
foreach (var box in (byType.GetValueOrDefault("ndCableBox") ?? []).Concat(byType.GetValueOrDefault("ndCableBoxY") ?? []))
    boxIds.Add(Rid(box));
var crossIds = new HashSet<int>();
foreach (var ox in (byType.GetValueOrDefault("ndOpticCross") ?? []).Concat(byType.GetValueOrDefault("ndOpticCrossB") ?? []))
    crossIds.Add(Rid(ox));
var pillarIds = new HashSet<int>();
foreach (var p in byType.GetValueOrDefault("ndPillar") ?? [])
    pillarIds.Add(Rid(p));
var buildingIds = new HashSet<int>();
foreach (var b in byType.GetValueOrDefault("ndBuilding") ?? [])
    buildingIds.Add(Rid(b));

// CP → предпочтительный fiber-host (кросс важнее муфты). Без этого кабели
// цепляются к ndCrossingPoint как к node, а сплиттеры — к муфте рядом.
var cpPreferredHost = new Dictionary<int, (string uid, string type, ClassRecord device)>();
void ConsiderCpHost(int cpId, ClassRecord device, string type)
{
    string uid = Uid("obj", device);
    if (!cpPreferredHost.TryGetValue(cpId, out var cur))
    {
        cpPreferredHost[cpId] = (uid, type, device);
        return;
    }
    if (cur.type != "cross" && type == "cross")
        cpPreferredHost[cpId] = (uid, type, device);
}
foreach (var box in (byType.GetValueOrDefault("ndCableBox") ?? []).Concat(byType.GetValueOrDefault("ndCableBoxY") ?? []))
{
    int id = Rid(box);
    if (deviceToCrossing.TryGetValue(id, out int cpId))
        ConsiderCpHost(cpId, box, "sleeve");
}
foreach (var ox in (byType.GetValueOrDefault("ndOpticCross") ?? []).Concat(byType.GetValueOrDefault("ndOpticCrossB") ?? []))
{
    int id = Rid(ox);
    if (deviceToCrossing.TryGetValue(id, out int cpId))
        ConsiderCpHost(cpId, ox, "cross");
}
Console.WriteLine($"CP with fiber host (box/cross): {cpPreferredHost.Count}");

bool TryResolvePoint(ClassRecord? obj, out (double lat, double lon, string name, string uid) geo)
{
    geo = default;
    if (obj is null) return false;
    int id = Rid(obj);
    if (pointGeo.TryGetValue(id, out geo)) return true;
    if (deviceToCrossing.TryGetValue(id, out int cpId) && pointGeo.TryGetValue(cpId, out geo))
        return true;

    var anc = NrbfWalk.FindAncestorCrossing(obj);
    if (anc != null && pointGeo.TryGetValue(Rid(anc), out geo))
    {
        deviceToCrossing.TryAdd(id, Rid(anc));
        return true;
    }

    double? x = NrbfWalk.TryGetX(obj);
    double? y = NrbfWalk.TryGetY(obj);
    if (x is not null && y is not null && InPrimaryVisioLayer(x.Value, y.Value))
    {
        var (lat, lon) = ToGeo(x.Value, y.Value);
        string name = NrbfWalk.DisplayName(obj, NrbfWalk.TypeTail(obj));
        geo = (lat, lon, name, Uid("obj", obj));
        pointGeo.TryAdd(id, geo);
        return true;
    }
    return false;
}

int? ResolveCrossingId(ClassRecord? obj)
{
    if (obj is null) return null;
    int id = Rid(obj);
    if (crossingByRec.ContainsKey(id)) return id;
    if (deviceToCrossing.TryGetValue(id, out int cpId)) return cpId;
    var anc = NrbfWalk.FindAncestorCrossing(obj);
    if (anc != null && NrbfWalk.TypeTail(anc) == "ndCrossingPoint")
    {
        deviceToCrossing.TryAdd(id, Rid(anc));
        return Rid(anc);
    }
    return null;
}

var hostFiberConnections = new Dictionary<string, JsonArray>(StringComparer.Ordinal);
var hostEmbeddedSplitters = new Dictionary<string, JsonArray>(StringComparer.Ordinal);
var hostMeta = new Dictionary<string, JsonObject>(StringComparer.Ordinal);

void EnsureHost(string uid, string type, string name, double lat, double lon)
{
    if (hostMeta.TryGetValue(uid, out var existing))
    {
        var cur = existing["type"]?.GetValue<string>() ?? "node";
        // Upgrade generic node to a more specific type when we learn more.
        if (cur == "node" && type is "sleeve" or "cross" or "support" or "cabinet")
            existing["type"] = type;
        else if (cur == "sleeve" && type == "cross")
            existing["type"] = type;
        var curName = existing["name"]?.GetValue<string>() ?? "";
        if (!string.IsNullOrWhiteSpace(name) &&
            (string.IsNullOrWhiteSpace(curName) ||
             curName.StartsWith("Узел ", StringComparison.Ordinal) ||
             curName.StartsWith("CP ", StringComparison.Ordinal) ||
             curName.StartsWith("Муфта ", StringComparison.Ordinal) ||
             curName.StartsWith("Кросс ", StringComparison.Ordinal)))
        {
            existing["name"] = name;
        }
        return;
    }

    var obj = new JsonObject
    {
        ["type"] = type,
        ["name"] = name,
        ["geometry"] = new JsonArray(lat, lon),
        ["uniqueId"] = uid,
        ["revision"] = 0
    };
    if (type == "sleeve")
    {
        obj["sleeveType"] = "generic";
        obj["maxFibers"] = 144;
    }
    hostMeta[uid] = obj;
    hostFiberConnections[uid] = new JsonArray();
    hostEmbeddedSplitters[uid] = new JsonArray();
}

// Emit hosts from georeferenced points.
// CrossingPoint с муфтой/кроссом не эмитим как отдельный node — иначе dual objects
// и кабели висят на node, а схема на sleeve.
foreach (var kv in pointGeo)
{
    var (lat, lon, name, uid) = kv.Value;
    if (crossingByRec.ContainsKey(kv.Key))
    {
        if (cpPreferredHost.ContainsKey(kv.Key))
            continue;
        EnsureHost(uid, "node", name, lat, lon);
        continue;
    }
    string type = boxIds.Contains(kv.Key) ? "sleeve"
        : crossIds.Contains(kv.Key) ? "cross"
        : pillarIds.Contains(kv.Key) ? "support"
        : buildingIds.Contains(kv.Key) ? "node"
        : "node";
    EnsureHost(uid, type, name, lat, lon);
}

// Муфты/кроссы без своих Visio-координат — ставим в точку связанного CP
foreach (var kv in cpPreferredHost)
{
    string hostUid = kv.Value.uid;
    if (hostMeta.ContainsKey(hostUid)) continue;
    if (!pointGeo.TryGetValue(kv.Key, out var cpGeo)) continue;
    string hostName = kv.Value.type == "cross"
        ? NrbfWalk.DisplayName(kv.Value.device, "Кросс")
        : NrbfWalk.DisplayName(kv.Value.device, "Муфта");
    EnsureHost(hostUid, kv.Value.type, hostName, cpGeo.lat, cpGeo.lon);
}

// Optic crosses without own Visio pin → place at parent crossing / linked CP
int crossesPlaced = 0;
foreach (var ox in (byType.GetValueOrDefault("ndOpticCross") ?? []).Concat(byType.GetValueOrDefault("ndOpticCrossB") ?? []))
{
    string uid = Uid("obj", ox);
    if (hostMeta.ContainsKey(uid) && hostMeta[uid]["type"]?.GetValue<string>() == "cross")
    {
        crossesPlaced++;
        continue;
    }
    if (!TryResolvePoint(ox, out var geo))
    {
        // last resort: parentDevice chain
        var parent = NrbfWalk.TryGetParentDevice(ox) ?? NrbfWalk.TryGetClass(ox, "_parent");
        if (!TryResolvePoint(parent, out geo)) continue;
    }
    string name = NrbfWalk.DisplayName(ox, "Кросс");
    EnsureHost(uid, "cross", name, geo.lat, geo.lon);
    crossesPlaced++;
}
Console.WriteLine($"Optic crosses placed: {crossesPlaced}");

// Концы кабеля / хост сварки → муфта/кросс (не голый CrossingPoint-node).
bool TryResolveFiberEndpoint(
    ClassRecord? end,
    out string hostUid,
    out string hostType,
    out double lat,
    out double lon,
    out string name)
{
    hostUid = "";
    hostType = "sleeve";
    lat = lon = 0;
    name = "";
    if (end is null || !TryResolvePoint(end, out var geo)) return false;
    lat = geo.lat;
    lon = geo.lon;
    name = geo.name;
    int endId = Rid(end);

    if (crossIds.Contains(endId))
    {
        hostUid = Uid("obj", end);
        hostType = "cross";
        name = NrbfWalk.DisplayName(end, "Кросс");
        EnsureHost(hostUid, hostType, name, lat, lon);
        return true;
    }
    if (boxIds.Contains(endId))
    {
        hostUid = Uid("obj", end);
        hostType = "sleeve";
        name = NrbfWalk.DisplayName(end, "Муфта");
        EnsureHost(hostUid, hostType, name, lat, lon);
        return true;
    }

    int? cpId = ResolveCrossingId(end);
    if (cpId is int cp && cpPreferredHost.TryGetValue(cp, out var pref))
    {
        hostUid = pref.uid;
        hostType = pref.type;
        name = pref.type == "cross"
            ? NrbfWalk.DisplayName(pref.device, "Кросс")
            : NrbfWalk.DisplayName(pref.device, "Муфта");
        // Координаты хоста (муфта/кросс), иначе точка CP — чтобы кабель совпал с placemark.
        if (hostMeta.TryGetValue(hostUid, out var existingHost)
            && existingHost["geometry"] is JsonArray hg && hg.Count >= 2)
        {
            lat = hg[0]!.GetValue<double>();
            lon = hg[1]!.GetValue<double>();
            var existingName = existingHost["name"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(existingName)) name = existingName!;
        }
        else if (pointGeo.TryGetValue(Rid(pref.device), out var devGeo))
        {
            lat = devGeo.lat;
            lon = devGeo.lon;
            name = devGeo.name;
        }
        else if (pointGeo.TryGetValue(cp, out var cpGeo))
        {
            lat = cpGeo.lat;
            lon = cpGeo.lon;
        }
        EnsureHost(hostUid, hostType, name, lat, lon);
        return true;
    }

    // Голый CP с кабелем — муфта (иначе createCableFromPoints отбросит node).
    hostUid = geo.uid;
    hostType = "sleeve";
    if (string.IsNullOrWhiteSpace(name) || name.StartsWith("Узел ", StringComparison.Ordinal))
        name = NrbfWalk.DisplayName(end, "Муфта");
    EnsureHost(hostUid, hostType, name, lat, lon);
    return true;
}

string? ResolveHostUidForDevice(ClassRecord? device, string fallbackUid)
{
    if (device is null) return fallbackUid;
    int id = Rid(device);
    string own = Uid("obj", device);
    if (hostMeta.ContainsKey(own)) return own;
    int? cpId = ResolveCrossingId(device);
    if (cpId is int cp && cpPreferredHost.TryGetValue(cp, out var pref))
        return pref.uid;
    return hostMeta.ContainsKey(fallbackUid) ? fallbackUid : own;
}

// medium Rid → порт сплиттера (0 = вход, 1.. = выходы)
var splitterMediumPort = new Dictionary<int, (string espId, string hostUid, int portIndex, JsonObject esp)>();

// Splitters are NOT map placemarks — embed into parent sleeve/cross
int splittersOut = 0, splittersSkipped = 0;
if (byType.TryGetValue("ndSplitter", out var splitters))
{
    foreach (var sp in splitters)
    {
        ClassRecord? hostDevice = null;
        string hostType = "sleeve";
        var walk = NrbfWalk.TryGetClass(sp, "_parent") ?? NrbfWalk.TryGetParentDevice(sp);
        var seen = new HashSet<object>(ReferenceEqualityComparer.Instance);
        int guard = 0;
        while (walk != null && guard++ < 12 && seen.Add(walk))
        {
            string t = NrbfWalk.TypeTail(walk);
            if (t.Contains("OpticCross", StringComparison.Ordinal))
            {
                hostDevice = walk;
                hostType = "cross";
                break;
            }
            if (t.Contains("CableBox", StringComparison.Ordinal) || t is "ndBox" or "ndBoxA")
            {
                hostDevice = walk;
                hostType = "sleeve";
                break;
            }
            if (t == "ndCrossingPoint")
            {
                hostDevice = walk;
                if (cpPreferredHost.TryGetValue(Rid(walk), out var prefOnCp))
                    hostType = prefOnCp.type;
                else
                    hostType = "sleeve";
                break;
            }
            walk = NrbfWalk.TryGetParentDevice(walk) ?? NrbfWalk.TryGetClass(walk, "_parent");
        }

        if (hostDevice is null || !TryResolvePoint(hostDevice, out var geo))
        {
            splittersSkipped++;
            continue;
        }

        string preferredUid = Uid("obj", hostDevice);
        string hostUid = ResolveHostUidForDevice(hostDevice, preferredUid) ?? geo.uid;
        if (cpPreferredHost.TryGetValue(Rid(hostDevice), out var prefHost) ||
            (ResolveCrossingId(hostDevice) is int cpForSp && cpPreferredHost.TryGetValue(cpForSp, out prefHost)))
        {
            hostUid = prefHost.uid;
            hostType = prefHost.type;
        }
        else if (crossIds.Contains(Rid(hostDevice)))
            hostType = "cross";
        else if (boxIds.Contains(Rid(hostDevice)) || hostType != "cross")
            hostType = hostType == "cross" ? "cross" : "sleeve";

        string hostName = hostType == "cross"
            ? NrbfWalk.DisplayName(hostDevice, "Кросс")
            : NrbfWalk.DisplayName(hostDevice, "Муфта");
        EnsureHost(hostUid, hostType, hostName, geo.lat, geo.lon);

        int ratio = 0;
        var outputs = NrbfWalk.TryGetClass(sp, "_outputs");
        foreach (var _ in NrbfWalk.EnumerateListItems(outputs)) ratio++;
        if (ratio <= 0)
        {
            string? local = NrbfWalk.TryGetString(sp, "_localName");
            if (!string.IsNullOrEmpty(local))
            {
                var m = System.Text.RegularExpressions.Regex.Match(local, @"[/:]\s*(\d+)");
                if (m.Success) ratio = int.Parse(m.Groups[1].Value);
            }
        }
        if (ratio <= 0) ratio = 8;

        string name = NrbfWalk.TryGetString(sp, "_localName")
            ?? NrbfWalk.TryGetString(sp, "_code")
            ?? $"Сплиттер 1/{ratio}";
        if (!name.Contains('/') && !name.Contains(':'))
            name = $"{name} 1/{ratio}";

        if (!hostEmbeddedSplitters.TryGetValue(hostUid, out var espList))
        {
            espList = new JsonArray();
            hostEmbeddedSplitters[hostUid] = espList;
        }

        int idx = espList.Count;
        double schemeX = 80 + (idx % 4) * 180;
        double schemeY = 60 + (idx / 4) * 120;
        var outs = new JsonArray();
        for (int i = 0; i < ratio; i++) outs.Add(null);

        string espId = Uid("esp", sp);
        var espObj = new JsonObject
        {
            ["id"] = espId,
            ["name"] = name,
            ["splitRatio"] = ratio,
            ["schemeX"] = schemeX,
            ["schemeY"] = schemeY,
            ["inputFiber"] = null,
            ["inputCableId"] = null,
            ["inputFiberNumber"] = null,
            ["outputConnections"] = outs
        };
        espList.Add(espObj);

        var inputMed = NrbfWalk.TryGetClass(sp, "_input");
        if (inputMed != null)
            splitterMediumPort[Rid(inputMed)] = (espId, hostUid, 0, espObj);

        int outIdx = 0;
        foreach (var outMed in NrbfWalk.EnumerateListItems(outputs))
        {
            outIdx++;
            if (NrbfWalk.TypeTail(outMed) != "ndSignalMedium") continue;
            splitterMediumPort[Rid(outMed)] = (espId, hostUid, outIdx, espObj);
        }

        splittersOut++;
    }
}
Console.WriteLine($"Splitters embedded: {splittersOut}, skipped: {splittersSkipped}; medium ports indexed: {splitterMediumPort.Count}");

int pillarsOut = pillarIds.Count(id => pointGeo.ContainsKey(id));
int buildingsOut = buildingIds.Count(id => pointGeo.ContainsKey(id));
Console.WriteLine($"Pillars(support): {pillarsOut}; Buildings(as node): {buildingsOut}");

// Cables
var cableItems = new List<JsonObject>();
int cablesOut = 0, cablesSkippedInner = 0, cablesSkippedNoEnds = 0;
int cableEndsOnSleeve = 0, cableEndsOnCross = 0, cableEndsOnOther = 0;
foreach (var cable in cableByRec.Values)
{
    int isInner = NrbfWalk.TryGetInt32(cable, "_isCableInner") ?? 0;
    if (isInner != 0) { cablesSkippedInner++; continue; }

    var first = NrbfWalk.TryGetClass(cable, "_firstCrossingPoint")
        ?? NrbfWalk.TryGetClass(cable, "_aSideContainer");
    var second = NrbfWalk.TryGetClass(cable, "_secondCrossingPoint")
        ?? NrbfWalk.TryGetClass(cable, "_bSideContainer");

    if (!TryResolveFiberEndpoint(first, out var fromUid, out var fromType, out var fromLat, out var fromLon, out var fromName)
        || !TryResolveFiberEndpoint(second, out var toUid, out var toType, out var toLat, out var toLon, out var toName))
    {
        cablesSkippedNoEnds++;
        continue;
    }

    void TallyEnd(string t)
    {
        if (t == "sleeve") cableEndsOnSleeve++;
        else if (t == "cross") cableEndsOnCross++;
        else cableEndsOnOther++;
    }
    TallyEnd(fromType);
    TallyEnd(toType);

    string cableUid = Uid("cable", cable);
    int fiberCount = 0;
    var fibersList = NrbfWalk.TryGetClass(cable, "_fibers");
    foreach (var _ in NrbfWalk.EnumerateListItems(fibersList)) fiberCount++;

    string cableType = "fiber";

    double length = NrbfWalk.TryGetDouble(cable, "_length") ?? 0;
    string cableTypeName = NrbfWalk.TryGetString(cable, "_cableType") ?? "";
    string name = NrbfWalk.TryGetAddressOrName(cable)
        ?? (!string.IsNullOrWhiteSpace(fromName) && !string.IsNullOrWhiteSpace(toName)
            ? $"{fromName} → {toName}"
            : $"Кабель {NrbfWalk.TryGetId(cable)}");

    var item = new JsonObject
    {
        ["type"] = "cable",
        ["cableType"] = cableType,
        ["from"] = -1,
        ["to"] = -1,
        ["geometry"] = new JsonArray
        {
            new JsonArray(fromLat, fromLon),
            new JsonArray(toLat, toLon)
        },
        ["fromUniqueId"] = fromUid,
        ["toUniqueId"] = toUid,
        ["uniqueId"] = cableUid,
        ["cableName"] = name,
        ["revision"] = 0,
        ["routeUniqueIds"] = new JsonArray(fromUid, toUid)
    };
    if (fiberCount > 0) item["fiberCount"] = fiberCount;
    if (length > 0) item["distance"] = (int)Math.Round(length);
    if (!string.IsNullOrWhiteSpace(cableTypeName)) item["cableModel"] = cableTypeName;

    cableItems.Add(item);
    cablesOut++;
}
Console.WriteLine($"Cables exported: {cablesOut}, skipped inner: {cablesSkippedInner}, no ends: {cablesSkippedNoEnds}");
Console.WriteLine($"Cable ends: sleeve={cableEndsOnSleeve}, cross={cableEndsOnCross}, other={cableEndsOnOther}");

void AssignSplitterPort(
    (string espId, string hostUid, int portIndex, JsonObject esp) port,
    (string cableUid, int fiberNum) fiber)
{
    var conn = new JsonObject
    {
        ["cableId"] = fiber.cableUid,
        ["fiberNumber"] = fiber.fiberNum
    };
    if (port.portIndex == 0)
    {
        port.esp["inputFiber"] = conn;
        port.esp["inputCableId"] = fiber.cableUid;
        port.esp["inputFiberNumber"] = fiber.fiberNum;
        return;
    }
    if (port.esp["outputConnections"] is not JsonArray outs) return;
    int idx = port.portIndex - 1;
    if (idx < 0 || idx >= outs.Count) return;
    outs[idx] = conn;
}

void AssignSplitterCascade(
    (string espId, string hostUid, int portIndex, JsonObject esp) fromPort,
    (string espId, string hostUid, int portIndex, JsonObject esp) toPort)
{
    // выход одного → вход другого
    if (fromPort.portIndex > 0 && toPort.portIndex == 0)
    {
        if (fromPort.esp["outputConnections"] is not JsonArray outs) return;
        int idx = fromPort.portIndex - 1;
        if (idx < 0 || idx >= outs.Count) return;
        outs[idx] = new JsonObject { ["splitterId"] = toPort.espId };
    }
    else if (toPort.portIndex > 0 && fromPort.portIndex == 0)
    {
        if (toPort.esp["outputConnections"] is not JsonArray outs) return;
        int idx = toPort.portIndex - 1;
        if (idx < 0 || idx >= outs.Count) return;
        outs[idx] = new JsonObject { ["splitterId"] = fromPort.espId };
    }
}

string? ResolveWeldHostUid(ClassRecord weld, ClassRecord? fiberHintCable)
{
    var parent = NrbfWalk.TryGetClass(weld, "_parent");
    if (parent != null)
    {
        if (TryResolveFiberEndpoint(parent, out var uid, out _, out _, out _, out _))
            return uid;
        string? via = ResolveHostUidForDevice(parent, Uid("obj", parent));
        if (via != null && hostFiberConnections.ContainsKey(via)) return via;
    }
    if (fiberHintCable != null)
    {
        var cp = NrbfWalk.TryGetClass(fiberHintCable, "_firstCrossingPoint")
            ?? NrbfWalk.TryGetClass(fiberHintCable, "_aSideContainer");
        if (TryResolveFiberEndpoint(cp, out var uid2, out _, out _, out _, out _))
            return uid2;
    }
    return null;
}

// Weldings (+ связи сплиттеров через сварку medium↔fiber)
int welds = 0, weldsSkipped = 0, splitterLinks = 0;
if (byType.TryGetValue("ndSimpleWeldNode", out var weldNodes))
{
    foreach (var weld in weldNodes)
    {
        var f1 = NrbfWalk.TryGetClass(weld, "_firstFiber");
        var f2 = NrbfWalk.TryGetClass(weld, "_secondFiber");
        if (f1 is null || f2 is null) { weldsSkipped++; continue; }

        bool aFiber = fiberIndex.TryGetValue(Rid(f1), out var a);
        bool bFiber = fiberIndex.TryGetValue(Rid(f2), out var b);
        bool aSplit = splitterMediumPort.TryGetValue(Rid(f1), out var sa);
        bool bSplit = splitterMediumPort.TryGetValue(Rid(f2), out var sb);

        if (aFiber && bFiber)
        {
            ClassRecord? cabRec = cableUidToRec.TryGetValue(a.cableUid, out var c1) ? c1 : null;
            string? hostUid = ResolveWeldHostUid(weld, cabRec);
            if (hostUid is null || !hostFiberConnections.ContainsKey(hostUid))
            {
                weldsSkipped++;
                continue;
            }

            hostFiberConnections[hostUid].Add(new JsonObject
            {
                ["from"] = new JsonObject
                {
                    ["cableId"] = a.cableUid,
                    ["fiberNumber"] = a.fiberNum
                },
                ["to"] = new JsonObject
                {
                    ["cableId"] = b.cableUid,
                    ["fiberNumber"] = b.fiberNum
                }
            });
            welds++;
            continue;
        }

        if (aFiber && bSplit)
        {
            AssignSplitterPort(sb, a);
            splitterLinks++;
            continue;
        }
        if (bFiber && aSplit)
        {
            AssignSplitterPort(sa, b);
            splitterLinks++;
            continue;
        }
        if (aSplit && bSplit)
        {
            AssignSplitterCascade(sa, sb);
            splitterLinks++;
            continue;
        }

        weldsSkipped++;
    }
}
Console.WriteLine($"Weldings exported: {welds}, splitter links: {splitterLinks}, skipped: {weldsSkipped}");

var final = new JsonArray();
foreach (var kv in hostMeta)
{
    var obj = kv.Value;
    if (hostFiberConnections.TryGetValue(kv.Key, out var conns) && conns.Count > 0)
        obj["fiberConnections"] = conns;
    if (hostEmbeddedSplitters.TryGetValue(kv.Key, out var esps) && esps.Count > 0)
        obj["embeddedSplitters"] = esps;
    final.Add(obj);
}
foreach (var c in cableItems)
    final.Add(c);

await File.WriteAllTextAsync(outPath, final.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
Console.WriteLine($"Wrote {final.Count} objects → {outPath}");

double minLat = double.MaxValue, maxLat = double.MinValue, minLon = double.MaxValue, maxLon = double.MinValue;
foreach (var kv in pointGeo.Values)
{
    minLat = Math.Min(minLat, kv.lat); maxLat = Math.Max(maxLat, kv.lat);
    minLon = Math.Min(minLon, kv.lon); maxLon = Math.Max(maxLon, kv.lon);
}
if (pointGeo.Count > 0)
{
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"BBox lat [{minLat:F6}..{maxLat:F6}] lon [{minLon:F6}..{maxLon:F6}]"));
}

return 0;

sealed class LimitedReadStream : Stream
{
    private readonly Stream _inner;
    private readonly long _length;
    private long _pos;
    public LimitedReadStream(Stream inner, long length) { _inner = inner; _length = length; }
    public override bool CanRead => true;
    public override bool CanSeek => true;
    public override bool CanWrite => false;
    public override long Length => _length;
    public override long Position { get => _pos; set => Seek(value, SeekOrigin.Begin); }
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count)
    {
        if (_pos >= _length) return 0;
        int toRead = (int)Math.Min(count, _length - _pos);
        int n = _inner.Read(buffer, offset, toRead);
        _pos += n;
        return n;
    }
    public override long Seek(long offset, SeekOrigin origin)
    {
        long target = origin switch
        {
            SeekOrigin.Begin => offset,
            SeekOrigin.Current => _pos + offset,
            SeekOrigin.End => _length + offset,
            _ => throw new ArgumentOutOfRangeException(nameof(origin))
        };
        if (target < 0 || target > _length) throw new IOException("seek OOB");
        _inner.Seek(target - _pos, SeekOrigin.Current);
        _pos = target;
        return _pos;
    }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
