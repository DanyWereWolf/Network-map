/**
 * On-prem ортофото-подложка: хранение пакетов XYZ-тайлов, GeoTIFF→тайлы (GDAL), merge участков.
 * data/basemaps/{orgId}/index.json
 * data/basemaps/{orgId}/{packId}/{z}/{x}/{y}.png
 * data/basemaps/{orgId}/_inbox/{jobId}.tif
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const nodeTiles = require('./basemap-node-tiles');

const ROOT_DIR = path.join(__dirname, '..', '..');
const BASEMAP_ROOT = path.join(ROOT_DIR, 'data', 'basemaps');

const DEFAULT_MIN_ZOOM = 12;
/** Выше 16 на больших сценах — миллионы тайлов и риск блокировки API. */
const DEFAULT_MAX_ZOOM = 16;
const ABSOLUTE_MAX_ZOOM = 18;
const DEFAULT_QUOTA_GB = 50;

function clampZoom(z, fallback) {
    var n = Number(z);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(0, Math.min(ABSOLUTE_MAX_ZOOM, Math.round(n)));
}

var jobs = new Map();
var queue = [];
var processing = false;

function getQuotaBytes(serverConfig) {
    var gb = parseFloat(
        (serverConfig && serverConfig.basemapOrgQuotaGb) ||
        process.env.BASEMAP_ORG_QUOTA_GB ||
        DEFAULT_QUOTA_GB
    );
    if (!gb || gb < 0.1) gb = DEFAULT_QUOTA_GB;
    return Math.floor(gb * 1024 * 1024 * 1024);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function orgDir(orgId) {
    return ensureDir(path.join(BASEMAP_ROOT, String(orgId)));
}

function indexPath(orgId) {
    return path.join(orgDir(orgId), 'index.json');
}

function readIndex(orgId) {
    var p = indexPath(orgId);
    if (!fs.existsSync(p)) {
        return { activePackId: null, packs: [], updates: [] };
    }
    try {
        var raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!raw || typeof raw !== 'object') return { activePackId: null, packs: [], updates: [] };
        if (!Array.isArray(raw.packs)) raw.packs = [];
        if (!Array.isArray(raw.updates)) raw.updates = [];
        return raw;
    } catch (e) {
        return { activePackId: null, packs: [], updates: [] };
    }
}

function writeIndex(orgId, index) {
    fs.writeFileSync(indexPath(orgId), JSON.stringify(index, null, 2), 'utf8');
}

function packDir(orgId, packId) {
    return path.join(orgDir(orgId), String(packId));
}

function manifestPath(orgId, packId) {
    return path.join(packDir(orgId, packId), 'manifest.json');
}

function readManifest(orgId, packId) {
    var p = manifestPath(orgId, packId);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        return null;
    }
}

function writeManifest(orgId, packId, manifest) {
    ensureDir(packDir(orgId, packId));
    fs.writeFileSync(manifestPath(orgId, packId), JSON.stringify(manifest, null, 2), 'utf8');
}

function newId(prefix) {
    return (prefix || 'bm') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function dirSizeBytes(dir, options) {
    if (!fs.existsSync(dir)) return 0;
    var skipNames = (options && options.skipNames) || null;
    var total = 0;
    function walk(d, depth) {
        var entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        for (var i = 0; i < entries.length; i++) {
            var name = entries[i].name;
            if (depth === 0 && skipNames && skipNames[name]) continue;
            var full = path.join(d, name);
            if (entries[i].isDirectory()) walk(full, depth + 1);
            else {
                try { total += fs.statSync(full).size; } catch (e2) {}
            }
        }
    }
    walk(dir, 0);
    return total;
}

function getOrgUsedBytes(orgId) {
    // Не обходим _inbox/_tmp: незавершённая нарезка может содержать миллионы PNG и блокирует event loop.
    return dirSizeBytes(orgDir(orgId), {
        skipNames: { _inbox: 1, _tmp: 1, _trash: 1 }
    });
}

function formatBytes(n) {
    var v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    if (v < 1024 * 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + ' MB';
    return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function findExecutable(names) {
    var pathEnv = process.env.PATH || '';
    var sep = process.platform === 'win32' ? ';' : ':';
    var exts = process.platform === 'win32' ? ['.exe', '.bat', '.cmd', ''] : [''];
    var dirs = pathEnv.split(sep);
    for (var n = 0; n < names.length; n++) {
        for (var d = 0; d < dirs.length; d++) {
            for (var e = 0; e < exts.length; e++) {
                var candidate = path.join(dirs[d], names[n] + exts[e]);
                if (fs.existsSync(candidate)) return candidate;
            }
        }
    }
    // Common Windows OSGeo4W / GISInternals paths
    if (process.platform === 'win32') {
        var guesses = [
            'C:\\OSGeo4W\\bin\\gdalinfo.exe',
            'C:\\OSGeo4W64\\bin\\gdalinfo.exe',
            'C:\\Program Files\\GDAL\\gdalinfo.exe'
        ];
        for (var g = 0; g < guesses.length; g++) {
            if (fs.existsSync(guesses[g])) return guesses[g];
        }
    }
    return null;
}

function resolveGdalTools() {
    var info = findExecutable(['gdalinfo']);
    var warp = findExecutable(['gdalwarp']);
    var tilesPy = findExecutable(['gdal2tiles.py', 'gdal2tiles']);
    if (!tilesPy && info) {
        var binDir = path.dirname(info);
        var candidates = [
            path.join(binDir, 'gdal2tiles.py'),
            path.join(binDir, '..', 'apps', 'gdal2tiles.py'),
            path.join(binDir, 'Scripts', 'gdal2tiles.py')
        ];
        for (var i = 0; i < candidates.length; i++) {
            if (fs.existsSync(candidates[i])) {
                tilesPy = candidates[i];
                break;
            }
        }
    }
    return { gdalinfo: info, gdalwarp: warp, gdal2tiles: tilesPy };
}

function runCmd(command, args, options) {
    return new Promise(function (resolve, reject) {
        var child = spawn(command, args, Object.assign({
            windowsHide: true,
            env: process.env
        }, options || {}));
        var stdout = '';
        var stderr = '';
        if (child.stdout) child.stdout.on('data', function (b) { stdout += b.toString(); });
        if (child.stderr) child.stderr.on('data', function (b) { stderr += b.toString(); });
        child.on('error', reject);
        child.on('close', function (code) {
            if (code === 0) resolve({ stdout: stdout, stderr: stderr });
            else reject(new Error((stderr || stdout || 'exit ' + code).slice(0, 2000)));
        });
    });
}

function parseGdalInfoBounds(stdout) {
    // Corner Coordinates / wgs84Extent / Upper Left etc.
    var wgs = /wgs84Extent\s*=\s*Polygon\s*\(\(([^)]+)\)\)/i.exec(stdout);
    if (wgs) {
        var pts = wgs[1].split(',').map(function (p) {
            var parts = p.trim().split(/\s+/);
            return [parseFloat(parts[0]), parseFloat(parts[1])];
        }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
        // lon lat pairs
        if (pts.length >= 2) {
            var lons = pts.map(function (p) { return p[0]; });
            var lats = pts.map(function (p) { return p[1]; });
            return [
                [Math.min.apply(null, lats), Math.min.apply(null, lons)],
                [Math.max.apply(null, lats), Math.max.apply(null, lons)]
            ];
        }
    }
    var ul = /Upper Left\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i.exec(stdout);
    var lr = /Lower Right\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i.exec(stdout);
    if (ul && lr) {
        var x1 = parseFloat(ul[1]);
        var y1 = parseFloat(ul[2]);
        var x2 = parseFloat(lr[1]);
        var y2 = parseFloat(lr[2]);
        // If values look like lon/lat
        if (Math.abs(x1) <= 180 && Math.abs(y1) <= 90 && Math.abs(x2) <= 180 && Math.abs(y2) <= 90) {
            return [
                [Math.min(y1, y2), Math.min(x1, x2)],
                [Math.max(y1, y2), Math.max(x1, x2)]
            ];
        }
    }
    return null;
}

function parseCornerLonLat(stdout) {
    // "(  lon,  lat) (lon, lat)" after Corner Coordinates in geographic
    var re = /\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
    var match;
    var lats = [];
    var lons = [];
    while ((match = re.exec(stdout)) !== null) {
        var a = parseFloat(match[1]);
        var b = parseFloat(match[2]);
        var c = parseFloat(match[3]);
        var d = parseFloat(match[4]);
        // prefer geographic pair if present as second tuple
        if (Math.abs(c) <= 180 && Math.abs(d) <= 90) {
            lons.push(c);
            lats.push(d);
        } else if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
            lons.push(a);
            lats.push(b);
        }
    }
    if (lats.length >= 2) {
        return [
            [Math.min.apply(null, lats), Math.min.apply(null, lons)],
            [Math.max.apply(null, lats), Math.max.apply(null, lons)]
        ];
    }
    return parseGdalInfoBounds(stdout);
}

async function gdalInfoJsonOrText(tools, filePath) {
    try {
        var r = await runCmd(tools.gdalinfo, ['-json', filePath]);
        var j = JSON.parse(r.stdout);
        if (j && j.wgs84Extent && j.wgs84Extent.coordinates) {
            var ring = j.wgs84Extent.coordinates[0] || [];
            var lons = ring.map(function (p) { return p[0]; });
            var lats = ring.map(function (p) { return p[1]; });
            if (lats.length) {
                return {
                    bounds: [
                        [Math.min.apply(null, lats), Math.min.apply(null, lons)],
                        [Math.max.apply(null, lats), Math.max.apply(null, lons)]
                    ],
                    srs: (j.coordinateSystem && j.coordinateSystem.wkt) || ''
                };
            }
        }
        if (j && j.cornerCoordinates) {
            var cc = j.cornerCoordinates;
            var pts = [cc.upperLeft, cc.lowerLeft, cc.lowerRight, cc.upperRight].filter(Boolean);
            // May be projected — fallback to text
        }
    } catch (e) {}
    var text = await runCmd(tools.gdalinfo, [filePath]);
    return { bounds: parseCornerLonLat(text.stdout), srs: text.stdout };
}

function tileFilePath(orgId, packId, z, x, y) {
    return path.join(packDir(orgId, packId), String(z), String(x), String(y) + '.png');
}

function findTile(orgId, packId, z, x, y) {
    var p = tileFilePath(orgId, packId, z, x, y);
    if (fs.existsSync(p)) return p;
    // gdal2tiles sometimes uses TMS y
    return null;
}

function listPacks(orgId) {
    var index = readIndex(orgId);
    return {
        activePackId: index.activePackId || null,
        packs: (index.packs || []).map(function (p) {
            var m = readManifest(orgId, p.id) || {};
            return Object.assign({}, p, m);
        }),
        updates: index.updates || [],
        usedBytes: getOrgUsedBytes(orgId)
    };
}

function getActiveManifest(orgId) {
    var index = readIndex(orgId);
    if (!index.activePackId) return null;
    var m = readManifest(orgId, index.activePackId);
    if (!m) return null;
    return Object.assign({ packId: index.activePackId }, m);
}

function activatePack(orgId, packId) {
    var index = readIndex(orgId);
    var found = (index.packs || []).some(function (p) { return p.id === packId; });
    if (!found) {
        var err = new Error('Пакет не найден');
        err.status = 404;
        throw err;
    }
    index.activePackId = packId;
    writeIndex(orgId, index);
    return getActiveManifest(orgId);
}

function rmrf(dir) {
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

function deletePack(orgId, packId) {
    var index = readIndex(orgId);
    index.packs = (index.packs || []).filter(function (p) { return p.id !== packId; });
    if (index.activePackId === packId) {
        index.activePackId = index.packs.length ? index.packs[index.packs.length - 1].id : null;
    }
    writeIndex(orgId, index);
    rmrf(packDir(orgId, packId));
    return { ok: true, activePackId: index.activePackId };
}

function getJob(jobId) {
    return jobs.get(jobId) || null;
}

function updateJob(jobId, patch) {
    var job = jobs.get(jobId);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    jobs.set(jobId, job);
    return job;
}

function enqueueJob(job) {
    jobs.set(job.id, job);
    queue.push(job.id);
    processQueue();
    return job;
}

function processQueue() {
    if (processing) return;
    var nextId = queue.shift();
    if (!nextId) return;
    var job = jobs.get(nextId);
    if (!job) {
        processQueue();
        return;
    }
    processing = true;
    runJob(job).then(function () {
        processing = false;
        processQueue();
    }).catch(function (err) {
        updateJob(job.id, {
            status: 'error',
            error: String(err && err.message ? err.message : err)
        });
        processing = false;
        processQueue();
    });
}

function finalizePackFromTiles(job, tilesOut, bounds, minZ, maxZ, usedXyz) {
    var orgId = job.orgId;
    var packId = job.packId || newId('pack');
    var outDir = ensureDir(packDir(orgId, packId));
    var warped = path.join(orgDir(orgId), '_inbox', job.id + '_3857.tif');

    if (job.mode === 'patch') {
        var index = readIndex(orgId);
        var activeId = index.activePackId;
        if (!activeId) throw new Error('Нет активной подложки для обновления участка');
        mergeTileTrees(tilesOut, packDir(orgId, activeId));
        var activeManifest = readManifest(orgId, activeId) || {};
        activeManifest.updatedAt = new Date().toISOString();
        activeManifest.bounds = mergeBounds(activeManifest.bounds, bounds);
        activeManifest.minZoom = Math.min(activeManifest.minZoom != null ? activeManifest.minZoom : minZ, minZ);
        activeManifest.maxZoom = Math.max(activeManifest.maxZoom != null ? activeManifest.maxZoom : maxZ, maxZ);
        if (!Array.isArray(activeManifest.updates)) activeManifest.updates = [];
        activeManifest.updates.push({
            at: activeManifest.updatedAt,
            bbox: bounds,
            sourceName: job.sourceName || '',
            jobId: job.id
        });
        writeManifest(orgId, activeId, activeManifest);
        index.updates = (index.updates || []).concat([{
            at: activeManifest.updatedAt,
            bbox: bounds,
            sourceName: job.sourceName || '',
            packId: activeId,
            jobId: job.id
        }]);
        writeIndex(orgId, index);
        packId = activeId;
    } else {
        // Полный пакет: перенос дерева тайлов вместо copy+rmrf (иначе часы блокировки event loop).
        try {
            if (fs.existsSync(outDir)) rmrf(outDir);
            fs.renameSync(tilesOut, outDir);
            tilesOut = null;
        } catch (eRenamePack) {
            ensureDir(outDir);
            copyTileTree(tilesOut, outDir);
        }
        var manifest = {
            packId: packId,
            crs: 'EPSG:3857',
            tms: !usedXyz,
            minZoom: minZ,
            maxZoom: maxZ,
            bounds: bounds,
            sourceName: job.sourceName || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updates: []
        };
        writeManifest(orgId, packId, manifest);
        var idx = readIndex(orgId);
        idx.packs = (idx.packs || []).filter(function (p) { return p.id !== packId; });
        idx.packs.push({
            id: packId,
            sourceName: job.sourceName || '',
            createdAt: manifest.createdAt
        });
        if (job.activate !== false) idx.activePackId = packId;
        writeIndex(orgId, idx);
    }

    try { fs.unlinkSync(job.inputPath); } catch (e1) {}
    try { fs.unlinkSync(warped); } catch (e2) {}
    if (tilesOut) {
        try { rmrf(tilesOut); } catch (e3) {}
    }

    updateJob(job.id, {
        status: 'ready',
        progress: 100,
        message: 'Готово',
        packId: packId,
        bounds: bounds
    });
}

async function runJobWithNode(job) {
    var orgId = job.orgId;
    var inboxFile = job.inputPath;
    if (!fs.existsSync(inboxFile)) throw new Error('Файл загрузки не найден');

    var minZ = clampZoom(job.minZoom != null ? job.minZoom : 13, 13);
    var maxZ = clampZoom(job.maxZoom != null ? job.maxZoom : DEFAULT_MAX_ZOOM, DEFAULT_MAX_ZOOM);
    if (maxZ < minZ) maxZ = minZ;
    var tilesOut = path.join(orgDir(orgId), '_inbox', job.id + '_tiles');
    rmrf(tilesOut);
    ensureDir(tilesOut);

    updateJob(job.id, {
        status: 'processing',
        progress: 8,
        message: 'GDAL нет — нарезка через встроенный движок (медленнее)…'
    });

    var result = await nodeTiles.generateTiles({
        inputPath: inboxFile,
        outDir: tilesOut,
        minZoom: minZ,
        maxZoom: maxZ,
        onProgress: function (pct, message) {
            updateJob(job.id, { progress: pct, message: message });
        }
    });

    updateJob(job.id, { progress: 88, message: job.mode === 'patch' ? 'Слияние с активной подложкой…' : 'Сохранение пакета…' });
    finalizePackFromTiles(job, tilesOut, result.bounds, result.minZoom, result.maxZoom, !result.tms);
}

async function runJobWithGdal(job, tools) {
    var orgId = job.orgId;
    var inboxFile = job.inputPath;
    if (!fs.existsSync(inboxFile)) throw new Error('Файл загрузки не найден');

    updateJob(job.id, { progress: 15, message: 'Чтение GeoTIFF…' });
    var info = await gdalInfoJsonOrText(tools, inboxFile);
    var bounds = info.bounds;
    if (!bounds) {
        throw new Error('Не удалось определить геопривязку GeoTIFF (WGS84 bounds)');
    }

    var warped = path.join(orgDir(orgId), '_inbox', job.id + '_3857.tif');

    updateJob(job.id, { progress: 30, message: 'Перепроецирование в EPSG:3857…' });
    await runCmd(tools.gdalwarp, [
        '-t_srs', 'EPSG:3857',
        '-r', 'bilinear',
        '-of', 'GTiff',
        '-co', 'TILED=YES',
        '-co', 'COMPRESS=DEFLATE',
        inboxFile,
        warped
    ]);

    updateJob(job.id, { progress: 50, message: 'Нарезка тайлов…' });
    var minZ = clampZoom(job.minZoom != null ? job.minZoom : DEFAULT_MIN_ZOOM, DEFAULT_MIN_ZOOM);
    var maxZ = clampZoom(job.maxZoom != null ? job.maxZoom : DEFAULT_MAX_ZOOM, DEFAULT_MAX_ZOOM);
    if (maxZ < minZ) maxZ = minZ;
    var tilesOut = path.join(orgDir(orgId), '_inbox', job.id + '_tiles');
    rmrf(tilesOut);
    ensureDir(tilesOut);

    function buildTilesInvocation(useXyz) {
        var args = [];
        if (useXyz) args.push('--xyz');
        args.push('-z', String(minZ) + '-' + String(maxZ), '-w', 'none', warped, tilesOut);
        if (/\.py$/i.test(tools.gdal2tiles)) {
            return {
                cmd: findExecutable(['python3', 'python', 'py']) || 'python',
                args: [tools.gdal2tiles].concat(args)
            };
        }
        return { cmd: tools.gdal2tiles, args: args };
    }

    var usedXyz = true;
    try {
        var inv = buildTilesInvocation(true);
        await runCmd(inv.cmd, inv.args);
    } catch (eXyz) {
        usedXyz = false;
        rmrf(tilesOut);
        ensureDir(tilesOut);
        var invTms = buildTilesInvocation(false);
        await runCmd(invTms.cmd, invTms.args);
    }

    updateJob(job.id, { progress: 80, message: job.mode === 'patch' ? 'Слияние с активной подложкой…' : 'Сохранение пакета…' });
    finalizePackFromTiles(job, tilesOut, bounds, minZ, maxZ, usedXyz);
}

async function runJob(job) {
    updateJob(job.id, { status: 'processing', progress: 5, message: 'Проверка GDAL…' });
    var tools = resolveGdalTools();
    var hasGdal = !!(tools.gdalinfo && tools.gdalwarp && tools.gdal2tiles);
    if (hasGdal) {
        await runJobWithGdal(job, tools);
        return;
    }
    if (!nodeTiles.isNodeTileEngineAvailable()) {
        throw new Error(
            'Нет GDAL и не установлены npm-пакеты geotiff/sharp. На сервере (Linux, Node ≥ 20): npm install --omit=dev'
        );
    }
    await runJobWithNode(job);
}

function mergeBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return [
        [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
        [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])]
    ];
}

function copyTileTree(srcRoot, destRoot) {
    ensureDir(destRoot);
    function walk(src, dest) {
        var entries = fs.readdirSync(src, { withFileTypes: true });
        for (var i = 0; i < entries.length; i++) {
            var name = entries[i].name;
            if (name === 'tilemapresource.xml' || name === 'openlayers.html' || name === 'googlemaps.html') continue;
            var s = path.join(src, name);
            var d = path.join(dest, name);
            if (entries[i].isDirectory()) {
                ensureDir(d);
                walk(s, d);
            } else if (/\.(png|jpg|jpeg|webp)$/i.test(name)) {
                fs.copyFileSync(s, d);
            }
        }
    }
    walk(srcRoot, destRoot);
}

function mergeTileTrees(srcRoot, destRoot) {
    ensureDir(destRoot);
    copyTileTree(srcRoot, destRoot);
}

function createUploadJob(options) {
    var orgId = options.orgId;
    var mode = options.mode === 'patch' ? 'patch' : 'full';
    var serverConfig = options.serverConfig || {};
    var fileSize = options.fileSize || 0;
    var quota = getQuotaBytes(serverConfig);
    var used = getOrgUsedBytes(orgId);
    if (used + fileSize > quota) {
        var err = new Error(
            'Квота подложки организации исчерпана (' + formatBytes(quota) + '). Сейчас занято ' + formatBytes(used) + '.'
        );
        err.status = 413;
        err.code = 'basemap_quota';
        throw err;
    }

    var jobId = newId('job');
    var inbox = ensureDir(path.join(orgDir(orgId), '_inbox'));
    var dest = path.join(inbox, jobId + '.tif');
    try {
        fs.renameSync(options.tempPath, dest);
    } catch (eRename) {
        fs.copyFileSync(options.tempPath, dest);
        try { fs.unlinkSync(options.tempPath); } catch (eUn) {}
    }

    var job = {
        id: jobId,
        orgId: String(orgId),
        mode: mode,
        status: 'queued',
        progress: 0,
        message: 'В очереди',
        inputPath: dest,
        sourceName: options.sourceName || '',
        minZoom: clampZoom(options.minZoom != null ? options.minZoom : DEFAULT_MIN_ZOOM, DEFAULT_MIN_ZOOM),
        maxZoom: clampZoom(options.maxZoom != null ? options.maxZoom : DEFAULT_MAX_ZOOM, DEFAULT_MAX_ZOOM),
        activate: options.activate !== false,
        packId: mode === 'full' ? newId('pack') : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: null
    };
    return enqueueJob(job);
}

function getGdalStatus() {
    var tools = resolveGdalTools();
    var gdalOk = !!(tools.gdalinfo && tools.gdalwarp && tools.gdal2tiles);
    var nodeOk = nodeTiles.isNodeTileEngineAvailable();
    return {
        ok: true,
        gdal: gdalOk,
        gdalinfo: !!tools.gdalinfo,
        gdalwarp: !!tools.gdalwarp,
        gdal2tiles: !!tools.gdal2tiles,
        nodeFallback: nodeOk,
        nodeEngine: nodeOk,
        engine: gdalOk ? 'gdal' : (nodeOk ? 'node' : 'none')
    };
}

module.exports = {
    BASEMAP_ROOT,
    DEFAULT_MIN_ZOOM,
    DEFAULT_MAX_ZOOM,
    getQuotaBytes,
    getOrgUsedBytes,
    formatBytes,
    listPacks,
    getActiveManifest,
    activatePack,
    deletePack,
    findTile,
    tileFilePath,
    createUploadJob,
    getJob,
    getGdalStatus,
    readManifest,
    newId
};
