namespace NedToNetworkMap;

/// <summary>Ellipsoidal Mercator as in NeD / oxy.gis.MercatorProjection.</summary>
static class Mercator
{
    const double RMajor = 6378137.0;
    const double RMinor = 6356752.3142;
    static readonly double Eccent = Math.Sqrt(1.0 - (RMinor / RMajor) * (RMinor / RMajor));
    static readonly double Com = 0.5 * Eccent;
    const double Deg2Rad = Math.PI / 180.0;
    const double Rad2Deg = 180.0 / Math.PI;
    const double Pi2 = Math.PI / 2.0;

    public static double LonToX(double lon) => RMajor * lon * Deg2Rad;

    public static double LatToY(double lat)
    {
        lat = Math.Min(89.5, Math.Max(lat, -89.5));
        double phi = lat * Deg2Rad;
        double sinphi = Math.Sin(phi);
        double con = Eccent * sinphi;
        con = Math.Pow((1.0 - con) / (1.0 + con), Com);
        double ts = Math.Tan(0.5 * (Math.PI * 0.5 - phi)) / con;
        return 0 - RMajor * Math.Log(ts);
    }

    public static double XToLon(double x) => x * Rad2Deg / RMajor;

    public static double YToLat(double y)
    {
        double ts = Math.Exp(-y / RMajor);
        double phi = Pi2 - 2 * Math.Atan(ts);
        double dphi = 1.0;
        int i = 0;
        while (Math.Abs(dphi) > 0.000000001 && i < 15)
        {
            double con = Eccent * Math.Sin(phi);
            dphi = Pi2 - 2 * Math.Atan(ts * Math.Pow((1.0 - con) / (1.0 + con), Com)) - phi;
            phi += dphi;
            i++;
        }
        return phi * Rad2Deg;
    }

    /// <summary>Visio inches → WGS84. Inverse of NeD MapTools: x=(lonToX-subX)*zoom.</summary>
    public static (double lat, double lon) VisioToLatLon(
        double visioX, double visioY,
        double originLon, double originLat,
        double zoomX, double zoomY)
    {
        double subX = LonToX(originLon);
        double subY = LatToY(originLat);
        double zx = zoomX == 0 ? 0.009 : zoomX;
        double zy = zoomY == 0 ? 0.009 : zoomY;
        double lon = XToLon(visioX / zx + subX);
        double lat = YToLat(visioY / zy + subY);
        return (lat, lon);
    }
}
