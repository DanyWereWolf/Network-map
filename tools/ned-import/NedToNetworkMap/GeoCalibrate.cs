using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace NedToNetworkMap;

/// <summary>
/// Сверка сети NeD с картой: геокодинг адресов → least-squares (origin + zoom)
/// и точный snap зданий с адресом на точку OSM/Nominatim.
/// </summary>
static class GeoCalibrate
{
    static readonly HttpClient Http = CreateClient();
    static readonly Regex AddrRe = new(
        @"^\s*(?:ул\.?\s*|улица\s+|пер\.?\s*|переулок\s+|пр\.?\s*|проезд\s+|пр-т\s*|проспект\s*)?(?<street>[А-Яа-яA-Za-zёЁIVXЪЬ.\-\s]+?)(?:\s+ул\.?|\s+улица|\s+пер\.?|\s+переулок)?\s*,\s*(?<num>\d+[А-Яа-яA-Za-z\/\-]*)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        c.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Network-map-ned-import", "1.0"));
        c.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return c;
    }

    public readonly record struct ControlPoint(double VisX, double VisY, double Lat, double Lon, string Label, string AddrKey);

    public sealed class Result
    {
        public bool Ok;
        public double OriginLat;
        public double OriginLon;
        public double ZoomX = 0.009;
        public double ZoomY = 0.009;
        public string Report = "";
        /// <summary>Нормализованный адрес → lat/lon для точной постановки здания.</summary>
        public Dictionary<string, (double lat, double lon)> AddressSnaps { get; } =
            new(StringComparer.OrdinalIgnoreCase);
        /// <summary>Контрольные точки Visio→WGS84 для локальной поправки (rubber-sheet).</summary>
        public List<ControlPoint> Controls { get; } = new();
    }

    /// <summary>
    /// Локальная поправка: IDW по контрольным точкам (разница snap − проекция).
    /// Улучшает посадку муфт/узлов относительно улиц рядом с известными адресами.
    /// </summary>
    public static (double lat, double lon) ApplyLocalCorrection(
        double visX, double visY,
        double projLat, double projLon,
        IReadOnlyList<ControlPoint> controls,
        double originLon, double originLat, double zoomX, double zoomY)
    {
        if (controls == null || controls.Count == 0) return (projLat, projLon);
        double wSum = 0, dLatSum = 0, dLonSum = 0;
        foreach (var cp in controls)
        {
            double dx = visX - cp.VisX;
            double dy = visY - cp.VisY;
            double dist2 = dx * dx + dy * dy;
            // влияние ~ до 40 Visio-дюймов (~нескольких кварталов)
            if (dist2 > 40 * 40) continue;
            double w = 1.0 / (dist2 + 0.25);
            var (pLat, pLon) = Mercator.VisioToLatLon(cp.VisX, cp.VisY, originLon, originLat, zoomX, zoomY);
            dLatSum += w * (cp.Lat - pLat);
            dLonSum += w * (cp.Lon - pLon);
            wSum += w;
        }
        if (wSum < 1e-9) return (projLat, projLon);
        return (projLat + dLatSum / wSum, projLon + dLonSum / wSum);
    }

    public static Result Calibrate(
        IReadOnlyList<(double x, double y, string name)> namedPoints,
        double seedZoomX,
        double seedZoomY,
        double seedOriginLat,
        double seedOriginLon,
        string? cityHint)
    {
        var result = new Result
        {
            ZoomX = seedZoomX == 0 ? 0.009 : seedZoomX,
            ZoomY = seedZoomY == 0 ? 0.009 : seedZoomY,
            OriginLat = seedOriginLat,
            OriginLon = seedOriginLon
        };

        var candidates = CollectAddressCandidates(namedPoints);
        if (candidates.Count < 3)
        {
            result.Report = $"too few address candidates ({candidates.Count})";
            return result;
        }

        double medX = Median(candidates.Select(c => c.x).ToList());
        double medY = Median(candidates.Select(c => c.y).ToList());
        var main = candidates
            .Where(c => Math.Abs(c.x - medX) < 120 && Math.Abs(c.y - medY) < 120)
            .ToList();

        // Равномерно по карте: сетка 3×3, по возможности разные улицы
        var picked = PickSpreadControls(main, maxCount: 24);
        // \u041c\u0430\u0439\u043a\u043e\u043f = Майкоп (без риска битой кодировки исходника)
        string city = string.IsNullOrWhiteSpace(cityHint) ? "\u041c\u0430\u0439\u043a\u043e\u043f" : cityHint.Trim();

        var allGeocoded = new List<ControlPoint>();
        Console.WriteLine($"Geocoding {picked.Count} addresses against map ({city})...");
        foreach (var cand in picked)
        {
            if (!TryGeocodeAddress(cand.street, cand.num, city, seedOriginLat, seedOriginLon, out double lat, out double lon))
            {
                Thread.Sleep(1100);
                continue;
            }
            // отсев геокода вне города (~15 км от seed)
            if (seedOriginLat != 0 || seedOriginLon != 0)
            {
                double km = HaversineKm(lat, lon, seedOriginLat, seedOriginLon);
                if (km > 15) { Thread.Sleep(1100); continue; }
            }
            string key = NormalizeAddrKey(cand.street, cand.num);
            var cp = new ControlPoint(cand.x, cand.y, lat, lon, $"{cand.street}, {cand.num}", key);
            allGeocoded.Add(cp);
            result.AddressSnaps[key] = (lat, lon);
            Thread.Sleep(1100);
            if (allGeocoded.Count >= 16) break;
        }

        var controls = allGeocoded.ToList();
        if (controls.Count < 3)
        {
            result.Report = $"geocode failed (got {controls.Count} controls)";
            return result;
        }

        // A) только origin при seed zoom + итеративный отсев выбросов
        double zx0 = result.ZoomX, zy0 = result.ZoomY;
        var originControls = controls.ToList();
        double oLonOnly = 0, oLatOnly = 0, errOnly = double.MaxValue;
        for (int iter = 0; iter < 4; iter++)
        {
            double sumMx = 0, sumMy = 0;
            foreach (var cp in originControls)
            {
                sumMx += Mercator.LonToX(cp.Lon) - cp.VisX / zx0;
                sumMy += Mercator.LatToY(cp.Lat) - cp.VisY / zy0;
            }
            oLonOnly = Mercator.XToLon(sumMx / originControls.Count);
            oLatOnly = Mercator.YToLat(sumMy / originControls.Count);
            errOnly = MeanErrorMeters(originControls, oLonOnly, oLatOnly, zx0, zy0);
            var errs = originControls.Select(cp =>
            {
                var (la, lo) = Mercator.VisioToLatLon(cp.VisX, cp.VisY, oLonOnly, oLatOnly, zx0, zy0);
                return Math.Sqrt(Math.Pow((lo - cp.Lon) * 79000, 2) + Math.Pow((la - cp.Lat) * 111000, 2));
            }).ToList();
            double med = Median(errs.ToList());
            double thr = Math.Max(120, med * 2.0);
            var next = originControls.Where((_, i) => errs[i] <= thr).ToList();
            if (next.Count < 3 || next.Count == originControls.Count) break;
            originControls = next;
        }
        controls = originControls;

        // B) origin + zoom (least squares), с отбрасыванием выбросов
        double bestLon = oLonOnly, bestLat = oLatOnly, bestZx = zx0, bestZy = zy0, bestErr = errOnly;
        string mode = "origin-only";

        if (FitLinear(controls.Select(p => (p.VisX, Mercator.LonToX(p.Lon))).ToList(), out double slopeX, out double interceptX)
            && FitLinear(controls.Select(p => (p.VisY, Mercator.LatToY(p.Lat))).ToList(), out double slopeY, out double interceptY)
            && Math.Abs(slopeX) >= 1e-12 && Math.Abs(slopeY) >= 1e-12)
        {
            var filtered = FilterOutliers(controls, slopeX, slopeY, interceptX, interceptY, 2.5);
            if (filtered.Count >= 3
                && FitLinear(filtered.Select(p => (p.VisX, Mercator.LonToX(p.Lon))).ToList(), out slopeX, out interceptX)
                && FitLinear(filtered.Select(p => (p.VisY, Mercator.LatToY(p.Lat))).ToList(), out slopeY, out interceptY))
            {
                double zoomX = 1.0 / slopeX;
                double zoomY = 1.0 / slopeY;
                // zoom X/Y не должны сильно расходиться и выходить за разумный диапазон
                double zoomRatio = Math.Max(zoomX, zoomY) / Math.Min(zoomX, zoomY);
                if (zoomX >= 0.002 && zoomX <= 0.05 && zoomY >= 0.002 && zoomY <= 0.05 && zoomRatio <= 1.35)
                {
                    double oLon = Mercator.XToLon(interceptX);
                    double oLat = Mercator.YToLat(interceptY);
                    double errFit = MeanErrorMeters(filtered, oLon, oLat, zoomX, zoomY);
                    if (errFit + 40 < bestErr) // берём zoom-fit только если заметно лучше
                    {
                        bestLon = oLon; bestLat = oLat; bestZx = zoomX; bestZy = zoomY; bestErr = errFit;
                        mode = "origin+zoom";
                        controls = filtered;
                    }
                }
            }
        }

        result.OriginLon = bestLon;
        result.OriginLat = bestLat;
        result.ZoomX = bestZx;
        result.ZoomY = bestZy;
        // Для локальной поправки — все удачно геокодированные точки, не только fit-subset
        result.Controls.AddRange(allGeocoded);

        result.Report = string.Create(CultureInfo.InvariantCulture,
            $"mode={mode} controls={controls.Count} snaps={result.AddressSnaps.Count} meanErr≈{bestErr:F0}m " +
            $"origin=({result.OriginLat:F6},{result.OriginLon:F6}) zoom=({result.ZoomX:F5},{result.ZoomY:F5}) city={city}");

        result.Ok = bestErr <= 2500;
        if (!result.Ok) result.Report += " (rejected: error too large)";
        return result;
    }

    public static string? TryParseAddrKey(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var m = AddrRe.Match(name);
        if (!m.Success) return null;
        string street = m.Groups["street"].Value.Trim();
        string num = m.Groups["num"].Value.Trim();
        if (street.Length < 3) return null;
        if (street.StartsWith("Узел", StringComparison.OrdinalIgnoreCase)) return null;
        return NormalizeAddrKey(street, num);
    }

    public static bool IsPrimaryVisioLayer(double x, double y, double medX, double medY)
        => Math.Abs(x - medX) < 150 && Math.Abs(y - medY) < 150;

    public static (double medX, double medY) PrimaryVisioMedian(IEnumerable<(double x, double y)> pts)
    {
        var list = pts.ToList();
        if (list.Count == 0) return (0, 0);
        double mx = Median(list.Select(p => p.x).ToList());
        double my = Median(list.Select(p => p.y).ToList());
        var main = list.Where(p => IsPrimaryVisioLayer(p.x, p.y, mx, my)).ToList();
        if (main.Count < 10) return (mx, my);
        return (Median(main.Select(p => p.x).ToList()), Median(main.Select(p => p.y).ToList()));
    }

    public static string? GuessCityFromOrigin(double originLat, double originLon)
    {
        if (originLat > 44.4 && originLat < 45.0 && originLon > 39.5 && originLon < 41.0)
            return "\u041c\u0430\u0439\u043a\u043e\u043f"; // Майкоп
        return null;
    }

    static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371.0;
        double dLat = (lat2 - lat1) * Math.PI / 180.0;
        double dLon = (lon2 - lon1) * Math.PI / 180.0;
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0)
              * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * R * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    static List<(double x, double y, string street, string num, string raw)> CollectAddressCandidates(
        IReadOnlyList<(double x, double y, string name)> namedPoints)
    {
        var candidates = new List<(double x, double y, string street, string num, string raw)>();
        foreach (var (x, y, name) in namedPoints)
        {
            if (string.IsNullOrWhiteSpace(name)) continue;
            if (x > 180 || y > 150) continue;
            var m = AddrRe.Match(name);
            if (!m.Success) continue;
            string street = m.Groups["street"].Value.Trim();
            string num = m.Groups["num"].Value.Trim();
            if (street.Length < 3) continue;
            if (street.StartsWith("Узел", StringComparison.OrdinalIgnoreCase)) continue;
            candidates.Add((x, y, street, num, name));
        }
        return candidates;
    }

    static List<(double x, double y, string street, string num, string raw)> PickSpreadControls(
        List<(double x, double y, string street, string num, string raw)> main, int maxCount)
    {
        if (main.Count == 0) return main;
        double minX = main.Min(p => p.x), maxX = main.Max(p => p.x);
        double minY = main.Min(p => p.y), maxY = main.Max(p => p.y);
        double dx = Math.Max(1e-6, maxX - minX);
        double dy = Math.Max(1e-6, maxY - minY);

        var buckets = new List<(double x, double y, string street, string num, string raw)>[9];
        for (int i = 0; i < 9; i++) buckets[i] = new();
        foreach (var c in main)
        {
            int ix = Math.Clamp((int)((c.x - minX) / dx * 3), 0, 2);
            int iy = Math.Clamp((int)((c.y - minY) / dy * 3), 0, 2);
            buckets[iy * 3 + ix].Add(c);
        }

        var picked = new List<(double x, double y, string street, string num, string raw)>();
        var seenStreets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        // Раунд 1: по одному из каждой ячейки
        foreach (var bucket in buckets)
        {
            foreach (var c in bucket.OrderBy(_ => Guid.NewGuid()))
            {
                string key = c.street.ToLowerInvariant();
                if (!seenStreets.Add(key) && picked.Count >= 9) continue;
                picked.Add(c);
                break;
            }
        }
        // Раунд 2: добрать разнообразие улиц
        foreach (var c in main.OrderBy(_ => Guid.NewGuid()))
        {
            if (picked.Count >= maxCount) break;
            if (picked.Any(p => Math.Abs(p.x - c.x) < 0.5 && Math.Abs(p.y - c.y) < 0.5)) continue;
            string key = c.street.ToLowerInvariant();
            if (!seenStreets.Add(key) && picked.Count >= 12) continue;
            picked.Add(c);
        }
        return picked;
    }

    static bool FitLinear(List<(double x, double y)> pts, out double a, out double c)
    {
        a = c = 0;
        int n = pts.Count;
        if (n < 2) return false;
        double sx = 0, sy = 0, sxx = 0, sxy = 0;
        foreach (var (x, y) in pts)
        {
            sx += x; sy += y; sxx += x * x; sxy += x * y;
        }
        double det = n * sxx - sx * sx;
        if (Math.Abs(det) < 1e-18) return false;
        a = (n * sxy - sx * sy) / det;
        c = (sy * sxx - sx * sxy) / det;
        return true;
    }

    static List<ControlPoint> FilterOutliers(
        List<ControlPoint> controls, double a, double b, double c, double d, double k)
    {
        var errs = new List<double>();
        foreach (var cp in controls)
        {
            double mx = a * cp.VisX + c;
            double my = b * cp.VisY + d;
            double dlon = (Mercator.XToLon(mx) - cp.Lon) * 79000;
            double dlat = (Mercator.YToLat(my) - cp.Lat) * 111000;
            errs.Add(Math.Sqrt(dlon * dlon + dlat * dlat));
        }
        double med = Median(errs.ToList());
        double thr = Math.Max(80, med * k);
        var kept = new List<ControlPoint>();
        for (int i = 0; i < controls.Count; i++)
            if (errs[i] <= thr) kept.Add(controls[i]);
        return kept.Count >= 3 ? kept : controls;
    }

    static double MeanErrorMeters(
        List<ControlPoint> controls, double oLon, double oLat, double zx, double zy)
    {
        double sum = 0;
        foreach (var cp in controls)
        {
            var (lat, lon) = Mercator.VisioToLatLon(cp.VisX, cp.VisY, oLon, oLat, zx, zy);
            double dx = (lon - cp.Lon) * 79000;
            double dy = (lat - cp.Lat) * 111000;
            sum += Math.Sqrt(dx * dx + dy * dy);
        }
        return sum / controls.Count;
    }

    static string NormalizeAddrKey(string street, string num)
    {
        string s = street.Trim().ToLowerInvariant()
            .Replace("ё", "е")
            .Replace("улица", "").Replace("ул.", "").Replace("ул ", "")
            .Replace("переулок", "").Replace("пер.", "").Replace("пер ", "")
            .Trim(' ', '.', ',');
        string n = num.Trim().ToLowerInvariant().Replace("ё", "е");
        return s + "|" + n;
    }

    static bool TryGeocodeAddress(
        string street, string num, string city,
        double biasLat, double biasLon,
        out double lat, out double lon)
    {
        lat = lon = 0;
        // free-form надёжнее для РФ; structured — запасной
        string free = $"{street}, {num}, {city}, \u0420\u043e\u0441\u0441\u0438\u044f";
        if (TryGeocodeUrl(
            "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&q="
            + Uri.EscapeDataString(free)
            + ViewboxQuery(biasLat, biasLon),
            out lat, out lon))
            return true;

        string streetQ = $"{num} {street}";
        return TryGeocodeUrl(
            "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru"
            + "&street=" + Uri.EscapeDataString(streetQ)
            + "&city=" + Uri.EscapeDataString(city)
            + "&country=Russia"
            + ViewboxQuery(biasLat, biasLon),
            out lat, out lon);
    }

    static string ViewboxQuery(double lat, double lon)
    {
        if (lat == 0 && lon == 0) return "";
        // ~8 км окно вокруг seed
        double d = 0.08;
        return string.Create(CultureInfo.InvariantCulture,
            $"&viewbox={lon - d},{lat + d},{lon + d},{lat - d}&bounded=0");
    }

    static bool TryGeocodeUrl(string url, out double lat, out double lon)
    {
        lat = lon = 0;
        try
        {
            using var resp = Http.GetAsync(url).GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) return false;
            string json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
                return false;
            var el = doc.RootElement[0];
            lat = double.Parse(el.GetProperty("lat").GetString()!, CultureInfo.InvariantCulture);
            lon = double.Parse(el.GetProperty("lon").GetString()!, CultureInfo.InvariantCulture);
            return lat != 0 || lon != 0;
        }
        catch
        {
            return false;
        }
    }

    static double Median(List<double> v)
    {
        if (v.Count == 0) return 0;
        v.Sort();
        return v[v.Count / 2];
    }
}
