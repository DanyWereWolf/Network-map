using System.Formats.Nrbf;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Xml.Linq;

namespace NedToNetworkMap;

static class NrbfWalk
{
    static readonly string[] IdMembers = ["_id", "ndObject+_id"];
    static readonly string[] SubDeviceMembers = ["_subDevices", "ndPassiveDevice+_subDevices", "ndDevice+_subDevices"];
    static readonly string[] ParentDeviceMembers = ["_parentDevice", "ndDevice+_parentDevice"];
    static readonly string[] UniqueNameMembers = ["_uniqueName", "ndObject+_uniqueName", "ndDevice+_uniqueName", "ndPassiveDevice+_uniqueName"];
    static readonly string[] ItemsMembers = ["_items"];

    public static void Collect(SerializationRecord? root, Dictionary<int, ClassRecord> byId)
    {
        if (root is null) return;
        var seen = new HashSet<object>(ReferenceEqualityComparer.Instance);
        var stack = new Stack<SerializationRecord>();
        stack.Push(root);

        while (stack.Count > 0)
        {
            var rec = stack.Pop();
            if (!seen.Add(rec)) continue;
            int id = RuntimeHelpers.GetHashCode(rec);

            if (rec is ClassRecord cr)
            {
                byId[id] = cr;
                foreach (string member in cr.MemberNames)
                {
                    if (!cr.HasMember(member)) continue;
                    try
                    {
                        var child = cr.GetSerializationRecord(member);
                        if (child != null) stack.Push(child);
                    }
                    catch (InvalidOperationException)
                    {
                        // primitive
                    }
                }
                continue;
            }

            if (rec is ArrayRecord ar)
            {
                try
                {
                    if (ar is SZArrayRecord<SerializationRecord?> szn)
                    {
                        foreach (var item in szn.GetArray())
                            if (item != null) stack.Push(item);
                    }
                    else if (ar is SZArrayRecord<SerializationRecord> sz)
                    {
                        foreach (var item in sz.GetArray())
                            if (item != null) stack.Push(item);
                    }
                }
                catch
                {
                    // ignore primitive arrays
                }
            }
        }
    }

    public static string TypeTail(ClassRecord cr)
    {
        string full = cr.TypeName.FullName ?? cr.TypeName.ToString() ?? "";
        int comma = full.IndexOf(',');
        if (comma >= 0) full = full[..comma];
        // strip generics: List`1[[...]] → List`1
        int gen = full.IndexOf('`');
        if (gen >= 0)
        {
            int after = full.IndexOf('[', gen);
            if (after < 0) after = full.Length;
            full = full[..after];
        }
        int dot = full.LastIndexOf('.');
        return dot >= 0 ? full[(dot + 1)..] : full;
    }

    public static bool IsType(ClassRecord cr, string tail) =>
        TypeTail(cr).Equals(tail, StringComparison.Ordinal);

    public static ClassRecord? TryGetClassAny(ClassRecord cr, params string[] members)
    {
        foreach (var m in members)
        {
            var c = TryGetClass(cr, m);
            if (c != null) return c;
        }
        return null;
    }

    public static string? TryGetStringAny(ClassRecord cr, params string[] members)
    {
        foreach (var m in members)
        {
            var s = TryGetString(cr, m);
            if (!string.IsNullOrEmpty(s)) return s;
        }
        return null;
    }

    public static long? TryGetId(ClassRecord cr)
    {
        foreach (var m in IdMembers)
        {
            var v = TryGetInt64(cr, m);
            if (v != null) return v;
        }
        return null;
    }

    static readonly string[] XMembers =
    [
        "_x", "ndCrossingPoint+_x", "ndArchitecture+_x",
        "ndPillar+_x", "ndBuilding+_x"
    ];
    static readonly string[] YMembers =
    [
        "_y", "ndCrossingPoint+_y", "ndArchitecture+_y",
        "ndPillar+_y", "ndBuilding+_y"
    ];
    static readonly string[] AddressMembers =
    [
        "_customName", "ndCrossingPoint+_customName",
        "_address", "ndCrossingPoint+_address", "ndArchitecture+_address",
        "_uniqueName", "ndObject+_uniqueName", "ndDevice+_uniqueName", "ndPassiveDevice+_uniqueName",
        "_localName", "_name", "_model", "_code",
        "ndObject+_comment", "_comment", "_placeInEntrance", "ndCrossingPoint+_placeInEntrance"
    ];

    public static double? TryGetX(ClassRecord cr)
    {
        foreach (var m in XMembers)
        {
            var v = TryGetDouble(cr, m);
            if (v != null) return v;
        }
        return null;
    }

    public static double? TryGetY(ClassRecord cr)
    {
        foreach (var m in YMembers)
        {
            var v = TryGetDouble(cr, m);
            if (v != null) return v;
        }
        return null;
    }

    static bool IsUselessName(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return true;
        s = s.Trim();
        if (s is "null" or "None" or "-") return true;
        return false;
    }

    public static string? TryGetAddressOrName(ClassRecord cr)
    {
        foreach (var m in AddressMembers)
        {
            var s = TryGetString(cr, m);
            if (!IsUselessName(s)) return s!.Trim();
        }
        return null;
    }

    /// <summary>Best-effort human label for map placemark.</summary>
    public static string DisplayName(ClassRecord cr, string fallbackPrefix)
    {
        var name = TryGetAddressOrName(cr);
        if (!IsUselessName(name)) return name!;
        var id = TryGetId(cr);
        return id != null ? $"{fallbackPrefix} {id}" : fallbackPrefix;
    }

    public static ClassRecord? TryGetSubDevices(ClassRecord cr) =>
        TryGetClassAny(cr, SubDeviceMembers);

    public static ClassRecord? TryGetParentDevice(ClassRecord cr) =>
        TryGetClassAny(cr, ParentDeviceMembers);

    public static string? TryGetUniqueName(ClassRecord cr) =>
        TryGetStringAny(cr, UniqueNameMembers);

    public static string? ExtractString(SerializationRecord? rec)
    {
        if (rec is null) return null;
        if (rec is PrimitiveTypeRecord<string> ps) return ps.Value;
        try
        {
            foreach (var name in new[] { "Value", "String", "Id" })
            {
                var prop = rec.GetType().GetProperty(name);
                if (prop?.GetValue(rec) is string s && !string.IsNullOrEmpty(s)) return s;
            }
            if (rec.GetType().GetMethod("GetValue")?.Invoke(rec, null) is string s2)
                return s2;
        }
        catch { }
        return null;
    }

    public static string? TryGetString(ClassRecord cr, string member)
    {
        if (!cr.HasMember(member)) return null;
        try
        {
            var s = cr.GetString(member);
            if (!string.IsNullOrEmpty(s)) return s;
        }
        catch { }
        try
        {
            object? raw = cr.GetRawValue(member);
            if (raw is string s) return string.IsNullOrEmpty(s) ? null : s;
            if (raw is SerializationRecord rec) return ExtractString(rec);
        }
        catch { }
        try { return ExtractString(cr.GetSerializationRecord(member)); }
        catch { return null; }
    }

    public static double? TryGetDouble(ClassRecord cr, string member)
    {
        if (!cr.HasMember(member)) return null;
        try { return cr.GetDouble(member); }
        catch
        {
            try { return cr.GetSingle(member); }
            catch
            {
                try
                {
                    object? raw = cr.GetRawValue(member);
                    if (raw is double d) return d;
                    if (raw is float f) return f;
                    if (raw is decimal m) return (double)m;
                }
                catch { }
            }
        }
        return null;
    }

    public static long? TryGetInt64(ClassRecord cr, string member)
    {
        if (!cr.HasMember(member)) return null;
        try { return cr.GetInt64(member); }
        catch
        {
            try { return cr.GetInt32(member); }
            catch { return null; }
        }
    }

    public static int? TryGetInt32(ClassRecord cr, string member)
    {
        if (!cr.HasMember(member)) return null;
        try { return cr.GetInt32(member); }
        catch
        {
            try { return (int)cr.GetInt64(member); }
            catch { return null; }
        }
    }

    public static ClassRecord? TryGetClass(ClassRecord cr, string member)
    {
        if (!cr.HasMember(member)) return null;
        try { return cr.GetClassRecord(member); }
        catch { return null; }
    }

    public static IEnumerable<ClassRecord> EnumerateListItems(ClassRecord? listOrObjectsList)
    {
        if (listOrObjectsList is null) yield break;

        var nested = TryGetClass(listOrObjectsList, "_items");
        if (nested != null && TypeTail(listOrObjectsList) == "ndObjectsList")
        {
            foreach (var item in EnumerateGenericList(nested))
                yield return item;
            yield break;
        }

        foreach (var item in EnumerateGenericList(listOrObjectsList))
            yield return item;
    }

    public static IEnumerable<ClassRecord> EnumerateGenericList(ClassRecord list)
    {
        ArrayRecord? arr = null;
        foreach (var m in ItemsMembers)
        {
            if (!list.HasMember(m)) continue;
            try { arr = list.GetArrayRecord(m); break; }
            catch { }
        }

        int size = TryGetInt32(list, "_size") ?? int.MaxValue;
        if (arr is null) yield break;

        SerializationRecord?[]? records = null;
        try
        {
            if (arr is SZArrayRecord<SerializationRecord?> szn) records = szn.GetArray();
            else if (arr is SZArrayRecord<SerializationRecord> sz)
            {
                var a = sz.GetArray();
                records = new SerializationRecord?[a.Length];
                for (int i = 0; i < a.Length; i++) records[i] = a[i];
            }
        }
        catch { yield break; }

        if (records is null) yield break;
        int n = Math.Min(size, records.Length);
        for (int i = 0; i < n; i++)
        {
            if (records[i] is ClassRecord cr)
                yield return cr;
        }
    }

    static bool IsMapLocationType(ClassRecord cr)
    {
        string t = TypeTail(cr);
        return t is "ndCrossingPoint" or "ndPillar" or "ndBuilding"
            || t.Contains("CableBox", StringComparison.Ordinal)
            || t.Contains("OpticCross", StringComparison.Ordinal);
    }

    /// <summary>Walk parentDevice/_parent until a geolocated host (crossing, box, cross…).</summary>
    public static ClassRecord? FindAncestorCrossing(ClassRecord? start)
    {
        var seen = new HashSet<object>(ReferenceEqualityComparer.Instance);
        var cur = start;
        int guard = 0;
        while (cur != null && guard++ < 12)
        {
            if (!seen.Add(cur)) break;
            if (IsMapLocationType(cur)) return cur;
            // Prefer parentDevice; splitters use _parent
            cur = TryGetParentDevice(cur) ?? TryGetClass(cur, "_parent");
        }
        return null;
    }

    public static double ParseRuDouble(string? s, double fallback = 0)
    {
        if (string.IsNullOrWhiteSpace(s)) return fallback;
        s = s.Trim().Replace(',', '.');
        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : fallback;
    }

    public static (double originLon, double originLat, double zoomX, double zoomY) ParseGisSettings(string? xml)
    {
        double originLon = 0, originLat = 0, zoomX = 0.009, zoomY = 0.009;
        if (string.IsNullOrWhiteSpace(xml)) return (originLon, originLat, zoomX, zoomY);
        try
        {
            var doc = XDocument.Parse(xml);
            var root = doc.Root;
            if (root is null) return (originLon, originLat, zoomX, zoomY);
            originLon = ParseRuDouble((string?)root.Attribute("ManualOriginLon"), originLon);
            originLat = ParseRuDouble((string?)root.Attribute("ManualOriginLat"), originLat);
            zoomX = ParseRuDouble((string?)root.Attribute("ZoomX"), zoomX);
            zoomY = ParseRuDouble((string?)root.Attribute("ZoomY"), zoomY);
            if (originLon == 0 && originLat == 0)
            {
                originLon = ParseRuDouble((string?)root.Attribute("PrevLon"), originLon);
                originLat = ParseRuDouble((string?)root.Attribute("PrevLat"), originLat);
            }
        }
        catch
        {
            // ignore malformed
        }
        return (originLon, originLat, zoomX, zoomY);
    }
}
