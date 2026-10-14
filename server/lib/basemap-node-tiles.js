/**
 * Нарезка GeoTIFF в XYZ PNG-тайлы без GDAL (geotiff + sharp).
 * Стратегия скорости:
 *  1) режем только maxZoom из исходника (параллельно);
 *  2) нижние уровни собираем пирамидой из 4 дочерних тайлов.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fromFile } = require('geotiff');
const sharp = require('sharp');

var EARTH = 6378137;
var MAX_LAT = 85.05112878;
var TILE = 256;
var CONCURRENCY = Math.max(2, Math.min(8, (os.cpus() && os.cpus().length) || 4));

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function clampLat(lat) {
    return Math.max(Math.min(lat, MAX_LAT), -MAX_LAT);
}

function lonLatToMerc(lon, lat) {
    var latC = clampLat(lat);
    return {
        x: EARTH * lon * Math.PI / 180,
        y: EARTH * Math.log(Math.tan(Math.PI / 4 + latC * Math.PI / 360))
    };
}

function mercToLonLat(x, y) {
    return {
        lon: x / EARTH * 180 / Math.PI,
        lat: (2 * Math.atan(Math.exp(y / EARTH)) - Math.PI / 2) * 180 / Math.PI
    };
}

function tileToMercBounds(z, x, y) {
    var n = Math.pow(2, z);
    var mercWorld = 2 * Math.PI * EARTH;
    var origin = -mercWorld / 2;
    var size = mercWorld / n;
    return {
        minX: origin + x * size,
        maxX: origin + (x + 1) * size,
        maxY: -(origin + y * size),
        minY: -(origin + (y + 1) * size)
    };
}

function lonLatToTileXY(lon, lat, z) {
    var m = lonLatToMerc(lon, lat);
    var mercWorld = 2 * Math.PI * EARTH;
    var origin = -mercWorld / 2;
    var n = Math.pow(2, z);
    var size = mercWorld / n;
    var x = Math.floor((m.x - origin) / size);
    var y = Math.floor(((-m.y) - origin) / size);
    return {
        x: Math.max(0, Math.min(n - 1, x)),
        y: Math.max(0, Math.min(n - 1, y))
    };
}

function looksLikeLonLat(bbox) {
    return Math.abs(bbox[0]) <= 180 && Math.abs(bbox[2]) <= 180 &&
        Math.abs(bbox[1]) <= 90 && Math.abs(bbox[3]) <= 90;
}

function looksLikeMercator(bbox) {
    var max = Math.PI * EARTH;
    return Math.abs(bbox[0]) <= max * 1.05 && Math.abs(bbox[2]) <= max * 1.05 &&
        Math.abs(bbox[1]) <= max * 1.05 && Math.abs(bbox[3]) <= max * 1.05 &&
        (Math.abs(bbox[0]) > 180 || Math.abs(bbox[2]) > 180 || Math.abs(bbox[1]) > 90);
}

function bboxToWgs84Bounds(bbox) {
    if (looksLikeLonLat(bbox)) {
        return [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
    }
    if (looksLikeMercator(bbox)) {
        var sw = mercToLonLat(bbox[0], bbox[1]);
        var ne = mercToLonLat(bbox[2], bbox[3]);
        return [
            [Math.min(sw.lat, ne.lat), Math.min(sw.lon, ne.lon)],
            [Math.max(sw.lat, ne.lat), Math.max(sw.lon, ne.lon)]
        ];
    }
    if (Math.abs(bbox[0]) < 1000 && Math.abs(bbox[2]) < 1000) {
        return [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
    }
    throw new Error(
        'Не удалось определить систему координат GeoTIFF. Установите GDAL или сохраните файл в WGS84 (EPSG:4326).'
    );
}

async function readGeoTiffMeta(filePath) {
    var tiff = await fromFile(filePath);
    var image = await tiff.getImage();
    var width = image.getWidth();
    var height = image.getHeight();
    var bbox = image.getBoundingBox();
    if (!bbox || bbox.length < 4 || !isFinite(bbox[0])) {
        throw new Error('В GeoTIFF нет геопривязки (bounding box)');
    }
    return {
        tiff: tiff,
        image: image,
        width: width,
        height: height,
        bbox: bbox,
        isLonLat: looksLikeLonLat(bbox),
        wgsBounds: bboxToWgs84Bounds(bbox)
    };
}

function geoToPixel(meta, lon, lat) {
    var bbox = meta.bbox;
    var xGeo;
    var yGeo;
    if (meta.isLonLat || looksLikeLonLat(bbox)) {
        xGeo = lon;
        yGeo = lat;
    } else {
        var m = lonLatToMerc(lon, lat);
        xGeo = m.x;
        yGeo = m.y;
    }
    var px = (xGeo - bbox[0]) / (bbox[2] - bbox[0]) * meta.width;
    var py = (bbox[3] - yGeo) / (bbox[3] - bbox[1]) * meta.height;
    return { x: px, y: py };
}

function tilePath(outDir, z, x, y) {
    return path.join(outDir, String(z), String(x), String(y) + '.png');
}

async function sampleTileRgba(meta, z, tx, ty) {
    var merc = tileToMercBounds(z, tx, ty);
    var nw = mercToLonLat(merc.minX, merc.maxY);
    var se = mercToLonLat(merc.maxX, merc.minY);
    var p0 = geoToPixel(meta, nw.lon, nw.lat);
    var p1 = geoToPixel(meta, se.lon, se.lat);

    var minPx = Math.floor(Math.min(p0.x, p1.x));
    var maxPx = Math.ceil(Math.max(p0.x, p1.x));
    var minPy = Math.floor(Math.min(p0.y, p1.y));
    var maxPy = Math.ceil(Math.max(p0.y, p1.y));

    if (maxPx < 0 || maxPy < 0 || minPx >= meta.width || minPy >= meta.height) {
        return null;
    }

    minPx = Math.max(0, minPx);
    minPy = Math.max(0, minPy);
    maxPx = Math.min(meta.width, maxPx);
    maxPy = Math.min(meta.height, maxPy);
    if (maxPx - minPx < 1 || maxPy - minPy < 1) return null;

    var pad = 1;
    var winMinX = Math.max(0, minPx - pad);
    var winMinY = Math.max(0, minPy - pad);
    var winMaxX = Math.min(meta.width, maxPx + pad);
    var winMaxY = Math.min(meta.height, maxPy + pad);
    var winW = winMaxX - winMinX;
    var winH = winMaxY - winMinY;
    if (winW < 1 || winH < 1) return null;

    // Read at most ~512px window — enough for 256 tile after resize
    var readW = Math.min(winW, 512);
    var readH = Math.min(winH, 512);

    var rasters = await meta.image.readRasters({
        window: [winMinX, winMinY, winMaxX, winMaxY],
        width: readW,
        height: readH,
        resampleMethod: 'nearest'
    });

    var bands = rasters.length;
    var rw = rasters.width;
    var rh = rasters.height;
    var rgba = Buffer.alloc(rw * rh * 4);
    var hasOpaque = false;
    for (var i = 0; i < rw * rh; i++) {
        var r = rasters[0][i];
        var g = bands > 1 ? rasters[1][i] : r;
        var b = bands > 2 ? rasters[2][i] : r;
        var a = bands > 3 ? rasters[3][i] : 255;
        if ((r === 0 && g === 0 && b === 0) || !isFinite(r)) a = 0;
        else hasOpaque = true;
        rgba[i * 4] = r & 255;
        rgba[i * 4 + 1] = g & 255;
        rgba[i * 4 + 2] = b & 255;
        rgba[i * 4 + 3] = a & 255;
    }
    if (!hasOpaque) return null;

    var tileP0 = geoToPixel(meta, nw.lon, nw.lat);
    var tileP1 = geoToPixel(meta, se.lon, se.lat);
    var left = (Math.min(tileP0.x, tileP1.x) - winMinX) / winW * rw;
    var top = (Math.min(tileP0.y, tileP1.y) - winMinY) / winH * rh;
    var right = (Math.max(tileP0.x, tileP1.x) - winMinX) / winW * rw;
    var bottom = (Math.max(tileP0.y, tileP1.y) - winMinY) / winH * rh;
    var cropLeft = Math.max(0, Math.floor(left));
    var cropTop = Math.max(0, Math.floor(top));
    var cropWidth = Math.max(1, Math.min(rw - cropLeft, Math.ceil(right - left)));
    var cropHeight = Math.max(1, Math.min(rh - cropTop, Math.ceil(bottom - top)));

    try {
        return await sharp(rgba, { raw: { width: rw, height: rh, channels: 4 } })
            .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
            .resize(TILE, TILE, { fit: 'fill', kernel: sharp.kernel.nearest })
            .png({ compressionLevel: 1, adaptiveFiltering: false })
            .toBuffer();
    } catch (e) {
        return null;
    }
}

async function mapPool(items, limit, worker) {
    var i = 0;
    var active = 0;
    return new Promise(function (resolve, reject) {
        var done = 0;
        var total = items.length;
        if (!total) return resolve();

        function next() {
            while (active < limit && i < total) {
                (function (item, idx) {
                    active++;
                    Promise.resolve()
                        .then(function () { return worker(item, idx); })
                        .then(function () {
                            active--;
                            done++;
                            if (done === total) resolve();
                            else next();
                        })
                        .catch(reject);
                })(items[i], i);
                i++;
            }
        }
        next();
    });
}

function tileRangeForBounds(sw, ne, z) {
    var a = lonLatToTileXY(sw.lon, sw.lat, z);
    var b = lonLatToTileXY(ne.lon, ne.lat, z);
    return {
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y)
    };
}

async function buildParentFromChildren(outDir, z, x, y) {
    var children = [
        { cx: x * 2, cy: y * 2, ox: 0, oy: 0 },
        { cx: x * 2 + 1, cy: y * 2, ox: 128, oy: 0 },
        { cx: x * 2, cy: y * 2 + 1, ox: 0, oy: 128 },
        { cx: x * 2 + 1, cy: y * 2 + 1, ox: 128, oy: 128 }
    ];
    var composites = [];
    for (var i = 0; i < children.length; i++) {
        var c = children[i];
        var p = tilePath(outDir, z + 1, c.cx, c.cy);
        if (!fs.existsSync(p)) continue;
        try {
            var buf = await sharp(p)
                .resize(128, 128, { kernel: sharp.kernel.nearest })
                .png({ compressionLevel: 1, adaptiveFiltering: false })
                .toBuffer();
            composites.push({ input: buf, left: c.ox, top: c.oy });
        } catch (e) {}
    }
    if (!composites.length) return false;
    var canvas = await sharp({
        create: {
            width: TILE,
            height: TILE,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite(composites)
        .png({ compressionLevel: 1, adaptiveFiltering: false })
        .toBuffer();
    var dir = ensureDir(path.join(outDir, String(z), String(x)));
    fs.writeFileSync(path.join(dir, y + '.png'), canvas);
    return true;
}

async function generateTiles(options) {
    var inputPath = options.inputPath;
    var outDir = ensureDir(options.outDir);
    var minZoom = Math.max(0, Number(options.minZoom) || 12);
    var maxZoom = Math.min(22, Number(options.maxZoom) || 16);
    // Node path: keep range tight
    if (maxZoom - minZoom > 6) maxZoom = minZoom + 6;
    if (maxZoom > 18) maxZoom = 18;
    if (minZoom > maxZoom) minZoom = Math.max(0, maxZoom - 4);

    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};

    onProgress(8, 'Чтение GeoTIFF…');
    var meta = await readGeoTiffMeta(inputPath);
    var bounds = meta.wgsBounds;
    var sw = { lat: bounds[0][0], lon: bounds[0][1] };
    var ne = { lat: bounds[1][0], lon: bounds[1][1] };

    var rangeMax = tileRangeForBounds(sw, ne, maxZoom);
    var plan = [];
    for (var x = rangeMax.minX; x <= rangeMax.maxX; x++) {
        for (var y = rangeMax.minY; y <= rangeMax.maxY; y++) {
            plan.push({ z: maxZoom, x: x, y: y });
        }
    }
    if (!plan.length) throw new Error('Нет тайлов для нарезки (проверьте bounds GeoTIFF)');

    var done = 0;
    var written = 0;
    onProgress(15, 'Нарезка z=' + maxZoom + ' (параллельно ×' + CONCURRENCY + '): 0 / ' + plan.length);

    await mapPool(plan, CONCURRENCY, async function (t) {
        var png = await sampleTileRgba(meta, t.z, t.x, t.y);
        if (png && png.length > 80) {
            var dir = ensureDir(path.join(outDir, String(t.z), String(t.x)));
            fs.writeFileSync(path.join(dir, t.y + '.png'), png);
            written++;
        }
        done++;
        if (done % 8 === 0 || done === plan.length) {
            var pct = 15 + Math.floor((done / plan.length) * 55);
            onProgress(pct, 'Нарезка z=' + maxZoom + ': ' + done + ' / ' + plan.length + ' (готово ' + written + ')');
        }
    });

    if (!written) {
        throw new Error('Не удалось создать тайлы — проверьте геопривязку GeoTIFF');
    }

    // Pyramid: maxZoom-1 … minZoom
    for (var z = maxZoom - 1; z >= minZoom; z--) {
        var range = tileRangeForBounds(sw, ne, z);
        var parents = [];
        for (var px = range.minX; px <= range.maxX; px++) {
            for (var py = range.minY; py <= range.maxY; py++) {
                parents.push({ z: z, x: px, y: py });
            }
        }
        var pDone = 0;
        onProgress(
            70 + Math.floor(((maxZoom - 1 - z) / Math.max(1, maxZoom - minZoom)) * 22),
            'Пирамида z=' + z + ': 0 / ' + parents.length
        );
        await mapPool(parents, CONCURRENCY, async function (t) {
            await buildParentFromChildren(outDir, t.z, t.x, t.y);
            pDone++;
            if (pDone % 16 === 0 || pDone === parents.length) {
                onProgress(
                    70 + Math.floor(((maxZoom - 1 - z) / Math.max(1, maxZoom - minZoom)) * 22),
                    'Пирамида z=' + z + ': ' + pDone + ' / ' + parents.length
                );
            }
        });
    }

    onProgress(95, 'Готово');
    return {
        bounds: bounds,
        minZoom: minZoom,
        maxZoom: maxZoom,
        tms: false,
        engine: 'node'
    };
}

module.exports = {
    generateTiles,
    readGeoTiffMeta: async function (filePath) {
        var meta = await readGeoTiffMeta(filePath);
        return { bounds: meta.wgsBounds, width: meta.width, height: meta.height };
    }
};
