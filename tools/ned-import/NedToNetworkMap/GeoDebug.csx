using System.Formats.Nrbf;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using NedToNetworkMap;

string nedPath = args[0];
using var fs = File.OpenRead(nedPath);
var header = new byte[48];
fs.Read(header, 0, 48);
long projectLength = BitConverter.ToInt64(header, 24);
fs.Position = BitConverter.ToInt64(header, 16);
using var projectStream = new LimitedReadStream(fs, projectLength);
var root = NrbfDecoder.DecodeClassRecord(projectStream)!;
var byId = new Dictionary<int, ClassRecord>();
NrbfWalk.Collect(root, byId);
static int Rid(SerializationRecord r) => RuntimeHelpers.GetHashCode(r);

double ox=0,oy=0,zx=0.009,zy=0.009;
foreach (var settings in byId.Values.Where(x => NrbfWalk.TypeTail(x)=="ndSettings"))
{
    var result = NrbfWalk.TryGetClass(settings, "__osmToVisioConverterResult");
    var origin = result != null ? NrbfWalk.TryGetClass(result, "_originNode") : null;
    if (origin != null) {
        var lat = NrbfWalk.TryGetDouble(origin, "_lat");
        var lon = NrbfWalk.TryGetDouble(origin, "_lon");
        if (lat is not null and not 0) { oy = lat.Value; ox = lon ?? 0; }
    }
    var gis = NrbfWalk.TryGetClass(settings, "_gisConverterSettings");
    var xml = gis != null ? NrbfWalk.TryGetString(gis, "_value") : null;
    if (!string.IsNullOrEmpty(xml)) {
        var p = NrbfWalk.ParseGisSettings(xml);
        zx = p.ZoomX; zy = p.ZoomY;
    }
}
Console.WriteLine(CultureInfo.InvariantCulture, $"origin lat={oy} lon={ox} zoom={zx},{zy}");

double minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9; int n=0;
var samples = new List<(string name,double x,double y,double lat,double lon)>();
foreach (var cr in byId.Values)
{
    string t = NrbfWalk.TypeTail(cr);
    if (t is not ("ndCrossingPoint" or "ndBuilding" or "ndCableBox" or "ndCableBoxY" or "ndOpticCross" or "ndOpticCrossB" or "ndPillar")) continue;
    var x = NrbfWalk.TryGetX(cr); var y = NrbfWalk.TryGetY(cr);
    if (x is null || y is null) continue;
    n++; minX=Math.Min(minX,x.Value); maxX=Math.Max(maxX,x.Value); minY=Math.Min(minY,y.Value); maxY=Math.Max(maxY,y.Value);
    var (lat,lon) = Mercator.VisioToLatLon(x.Value,y.Value,ox,oy,zx,zy);
    string name = NrbfWalk.DisplayName(cr, t);
    if (name.Contains("молком", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Черкес", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Железнодор", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Политех", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Пятероч", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Пятёроч", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Fix Price", StringComparison.OrdinalIgnoreCase)
        || name.Contains("Wildberries", StringComparison.OrdinalIgnoreCase)
        || samples.Count < 5)
        samples.Add((name, x.Value, y.Value, lat, lon));
}
Console.WriteLine(CultureInfo.InvariantCulture, $"points={n} x=[{minX:F3}..{maxX:F3}] y=[{minY:F3}..{maxY:F3}]");
foreach (var s in samples.Take(30))
    Console.WriteLine(CultureInfo.InvariantCulture, $"  vis=({s.x:F4},{s.y:F4}) geo=({s.lat:F6},{s.lon:F6}) {s.name.Substring(0, Math.Min(70,s.name.Length))}");

// What zoom would map max X to lon span of ~0.08° (city ~8km)?
double cityLonSpan = 0.08; // degrees
double mercSpan = Mercator.LonToX(ox + cityLonSpan) - Mercator.LonToX(ox);
double zoomIfCity = maxX / mercSpan;
Console.WriteLine(CultureInfo.InvariantCulture, $"If city lon span 0.08°, implied zoomX from maxX ≈ {zoomIfCity}");
double mercSpanY = Mercator.LatToY(oy + 0.08) - Mercator.LatToY(oy);
double zoomIfCityY = maxY / mercSpanY;
Console.WriteLine(CultureInfo.InvariantCulture, $"If city lat span 0.08°, implied zoomY from maxY ≈ {zoomIfCityY}");

// Current geo span
var a = Mercator.VisioToLatLon(minX,minY,ox,oy,zx,zy);
var b = Mercator.VisioToLatLon(maxX,maxY,ox,oy,zx,zy);
Console.WriteLine(CultureInfo.InvariantCulture, $"current span lat={b.lat-a.lat:F4} lon={b.lon-a.lon:F4}");
