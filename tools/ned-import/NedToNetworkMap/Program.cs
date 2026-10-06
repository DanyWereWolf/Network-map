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
double originLon = 0, originLat = 0, zoomX = 0.009, zoomY = 0.009;

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
            if (parsed.originLat != 0 || parsed.originLon != 0)
            {
                (originLon, originLat, zoomX, zoomY) = parsed;
                Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                    $"GIS settings: origin=({originLat:F7}, {originLon:F7}) zoom=({zoomX}, {zoomY})"));
            }
            else if (originLat == 0 && originLon == 0)
            {
                zoomX = parsed.zoomX;
                zoomY = parsed.zoomY;
            }
        }

        var result = NrbfWalk.TryGetClass(settings, "__osmToVisioConverterResult");
        var origin = result != null ? NrbfWalk.TryGetClass(result, "_originNode") : null;
        if (origin != null && originLat == 0 && originLon == 0)
        {
            double? lat = NrbfWalk.TryGetDouble(origin, "_lat");
            double? lon = NrbfWalk.TryGetDouble(origin, "_lon");
            if (lat is not null and not 0 || lon is not null and not 0)
            {
                originLat = lat ?? 0;
                originLon = lon ?? 0;
                Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
                    $"Origin node: ({originLat:F7}, {originLon:F7})"));
            }
        }
    }
}

if (originLat == 0 && originLon == 0)
    Console.WriteLine("WARNING: GIS origin not found — coordinates may be wrong.");

(double lat, double lon) ToGeo(double x, double y) =>
    Mercator.VisioToLatLon(x, y, originLon, originLat, zoomX, zoomY);

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

void RegisterPoint(ClassRecord obj, string defaultPrefix)
{
    double? x = NrbfWalk.TryGetX(obj);
    double? y = NrbfWalk.TryGetY(obj);
    if (x is null || y is null) return;
    var (lat, lon) = ToGeo(x.Value, y.Value);
    string name = NrbfWalk.DisplayName(obj, defaultPrefix);
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
Console.WriteLine($"Points with coordinates: {pointGeo.Count}");

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
    if (x is not null && y is not null)
    {
        var (lat, lon) = ToGeo(x.Value, y.Value);
        string name = NrbfWalk.DisplayName(obj, NrbfWalk.TypeTail(obj));
        geo = (lat, lon, name, Uid("obj", obj));
        pointGeo.TryAdd(id, geo);
        return true;
    }
    return false;
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

// Emit hosts from georeferenced points
foreach (var kv in pointGeo)
{
    var (lat, lon, name, uid) = kv.Value;
    string type = boxIds.Contains(kv.Key) ? "sleeve"
        : crossIds.Contains(kv.Key) ? "cross"
        : pillarIds.Contains(kv.Key) ? "support"
        : buildingIds.Contains(kv.Key) ? "node"
        : "node";
    EnsureHost(uid, type, name, lat, lon);
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
                // CP itself can host if typed as sleeve/cross via linked box/cross
                hostDevice = walk;
                hostType = boxIds.Contains(Rid(walk)) ? "sleeve"
                    : crossIds.Contains(Rid(walk)) ? "cross"
                    : "sleeve";
                break;
            }
            walk = NrbfWalk.TryGetParentDevice(walk) ?? NrbfWalk.TryGetClass(walk, "_parent");
        }

        if (hostDevice is null || !TryResolvePoint(hostDevice, out var geo))
        {
            splittersSkipped++;
            continue;
        }

        // Prefer the dedicated box/cross uid when that host already exists;
        // otherwise use the resolved geo uid (often the crossing point).
        string preferredUid = Uid("obj", hostDevice);
        string hostUid = hostMeta.ContainsKey(preferredUid) ? preferredUid : geo.uid;
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

        espList.Add(new JsonObject
        {
            ["id"] = Uid("esp", sp),
            ["name"] = name,
            ["splitRatio"] = ratio,
            ["schemeX"] = schemeX,
            ["schemeY"] = schemeY,
            ["inputFiber"] = null,
            ["inputCableId"] = null,
            ["inputFiberNumber"] = null,
            ["outputConnections"] = outs
        });
        splittersOut++;
    }
}
Console.WriteLine($"Splitters embedded: {splittersOut}, skipped: {splittersSkipped}");

int pillarsOut = pillarIds.Count(id => pointGeo.ContainsKey(id));
int buildingsOut = buildingIds.Count(id => pointGeo.ContainsKey(id));
Console.WriteLine($"Pillars(support): {pillarsOut}; Buildings(as node): {buildingsOut}");

// Cables
var cableItems = new List<JsonObject>();
int cablesOut = 0, cablesSkippedInner = 0, cablesSkippedNoEnds = 0;
foreach (var cable in cableByRec.Values)
{
    int isInner = NrbfWalk.TryGetInt32(cable, "_isCableInner") ?? 0;
    if (isInner != 0) { cablesSkippedInner++; continue; }

    var first = NrbfWalk.TryGetClass(cable, "_firstCrossingPoint")
        ?? NrbfWalk.TryGetClass(cable, "_aSideContainer");
    var second = NrbfWalk.TryGetClass(cable, "_secondCrossingPoint")
        ?? NrbfWalk.TryGetClass(cable, "_bSideContainer");

    if (!TryResolvePoint(first, out var from) || !TryResolvePoint(second, out var to))
    {
        cablesSkippedNoEnds++;
        continue;
    }

    // degenerate zero-length map edge (same point) — still keep if different uids
    string cableUid = Uid("cable", cable);
    int fiberCount = 0;
    var fibersList = NrbfWalk.TryGetClass(cable, "_fibers");
    foreach (var _ in NrbfWalk.EnumerateListItems(fibersList)) fiberCount++;

    string cableType = "fiber";

    double length = NrbfWalk.TryGetDouble(cable, "_length") ?? 0;
    string cableTypeName = NrbfWalk.TryGetString(cable, "_cableType") ?? "";
    string name = NrbfWalk.TryGetAddressOrName(cable)
        ?? (!string.IsNullOrWhiteSpace(from.name) && !string.IsNullOrWhiteSpace(to.name)
            ? $"{from.name} → {to.name}"
            : $"Кабель {NrbfWalk.TryGetId(cable)}");

    // Ensure endpoints exist as hosts (do not downgrade sleeve/cross)
    EnsureHost(from.uid, "node", from.name, from.lat, from.lon);
    EnsureHost(to.uid, "node", to.name, to.lat, to.lon);

    var item = new JsonObject
    {
        ["type"] = "cable",
        ["cableType"] = cableType,
        ["from"] = -1,
        ["to"] = -1,
        ["geometry"] = new JsonArray
        {
            new JsonArray(from.lat, from.lon),
            new JsonArray(to.lat, to.lon)
        },
        ["fromUniqueId"] = from.uid,
        ["toUniqueId"] = to.uid,
        ["uniqueId"] = cableUid,
        ["cableName"] = name,
        ["revision"] = 0,
        ["routeUniqueIds"] = new JsonArray(from.uid, to.uid)
    };
    if (fiberCount > 0) item["fiberCount"] = fiberCount;
    if (length > 0) item["distance"] = (int)Math.Round(length);
    if (!string.IsNullOrWhiteSpace(cableTypeName)) item["cableModel"] = cableTypeName;

    cableItems.Add(item);
    cablesOut++;
}
Console.WriteLine($"Cables exported: {cablesOut}, skipped inner: {cablesSkippedInner}, no ends: {cablesSkippedNoEnds}");

// Weldings
int welds = 0, weldsSkipped = 0;
if (byType.TryGetValue("ndSimpleWeldNode", out var weldNodes))
{
    foreach (var weld in weldNodes)
    {
        var f1 = NrbfWalk.TryGetClass(weld, "_firstFiber");
        var f2 = NrbfWalk.TryGetClass(weld, "_secondFiber");
        if (f1 is null || f2 is null) { weldsSkipped++; continue; }

        if (!fiberIndex.TryGetValue(Rid(f1), out var a) ||
            !fiberIndex.TryGetValue(Rid(f2), out var b))
        {
            weldsSkipped++;
            continue;
        }

        var parent = NrbfWalk.TryGetClass(weld, "_parent");
        string? hostUid = null;
        if (parent != null)
        {
            string pt = NrbfWalk.TypeTail(parent);
            if (pt.Contains("CableBox", StringComparison.Ordinal) || pt is "ndBox" or "ndBoxA"
                || pt.Contains("OpticCross", StringComparison.Ordinal))
            {
                hostUid = Uid("obj", parent);
            }
            else if (pt == "ndCrossingPoint" && pointGeo.TryGetValue(Rid(parent), out var pg))
            {
                hostUid = pg.uid;
            }
            else if (deviceToCrossing.TryGetValue(Rid(parent), out int cpId) && pointGeo.TryGetValue(cpId, out var pg2))
            {
                hostUid = pg2.uid;
            }
        }

        if ((hostUid is null || !hostFiberConnections.ContainsKey(hostUid))
            && cableUidToRec.TryGetValue(a.cableUid, out var cab))
        {
            var cp = NrbfWalk.TryGetClass(cab, "_firstCrossingPoint")
                ?? NrbfWalk.TryGetClass(cab, "_aSideContainer");
            if (TryResolvePoint(cp, out var pg))
                hostUid = pg.uid;
        }

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
    }
}
Console.WriteLine($"Weldings exported: {welds}, skipped: {weldsSkipped}");

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
