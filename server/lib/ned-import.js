/**
 * Конвертация проекта NeD (.ned) → JSON-массив Network-map
 * через tools/ned-import/NedToNetworkMap (.NET).
 *
 * Собранный конвертер лежит в репозитории (tools/ned-import/dist, `npm run ned:build`).
 * Для запуска нужен только .NET Runtime 10: если его нет, он скачивается (~37 МБ)
 * и распаковывается в tools/.dotnet без прав администратора.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PROJECT_DIR = path.join(ROOT_DIR, 'tools', 'ned-import', 'NedToNetworkMap');
const DIST_DLL = path.join(ROOT_DIR, 'tools', 'ned-import', 'dist', 'NedToNetworkMap.dll');
const BIN_DLL = path.join(PROJECT_DIR, 'bin', 'Release', 'net10.0', 'NedToNetworkMap.dll');
const LOCAL_DOTNET_DIR = path.join(ROOT_DIR, 'tools', '.dotnet');
const IS_WIN = process.platform === 'win32';
const LOCAL_DOTNET_EXE = path.join(LOCAL_DOTNET_DIR, IS_WIN ? 'dotnet.exe' : 'dotnet');
const REQUIRED_MAJOR = 10;

let readyPromise = null;

function dotnetEnv(exe) {
    const env = Object.assign({}, process.env, {
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
        DOTNET_NOLOGO: '1',
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1'
    });
    if (exe === LOCAL_DOTNET_EXE) env.DOTNET_ROOT = LOCAL_DOTNET_DIR;
    return env;
}

function listDotnet(exe, flag) {
    try {
        const r = spawnSync(exe, [flag], {
            windowsHide: true, encoding: 'utf8', timeout: 15000, env: dotnetEnv(exe)
        });
        if (r.error || r.status !== 0) return null;
        return String(r.stdout || '');
    } catch (_) {
        return null;
    }
}

function hasRuntime(exe) {
    return new RegExp('^Microsoft\\.NETCore\\.App\\s+' + REQUIRED_MAJOR + '\\.', 'm')
        .test(listDotnet(exe, '--list-runtimes') || '');
}

function hasSdk(exe) {
    return new RegExp('^' + REQUIRED_MAJOR + '\\.', 'm').test(listDotnet(exe, '--list-sdks') || '');
}

function dotnetCandidates() {
    const list = [];
    if (fs.existsSync(LOCAL_DOTNET_EXE)) list.push(LOCAL_DOTNET_EXE);
    list.push('dotnet');
    return list;
}

function run(cmd, args, label) {
    return new Promise(function(resolve, reject) {
        const child = spawn(cmd, args, { cwd: ROOT_DIR, windowsHide: true, env: dotnetEnv(cmd) });
        let out = '';
        child.stdout.on('data', function(d) { out += d.toString(); });
        child.stderr.on('data', function(d) { out += d.toString(); });
        child.on('error', function(err) {
            reject(new Error(label + ': не удалось запустить ' + cmd + ' (' + err.message + ')'));
        });
        child.on('close', function(code) {
            if (code === 0) resolve(out);
            else reject(new Error(label + ' (код ' + code + '): ' + out.trim().slice(-800)));
        });
    });
}

function runtimeArchiveUrl() {
    let osName;
    if (IS_WIN) osName = 'win';
    else if (process.platform === 'darwin') osName = 'osx';
    else if (process.platform === 'linux') osName = fs.existsSync('/etc/alpine-release') ? 'linux-musl' : 'linux';
    else throw new Error('Автоустановка .NET не поддерживается на ' + process.platform);
    const arch = { x64: 'x64', arm64: 'arm64', arm: 'arm' }[process.arch];
    if (!arch) throw new Error('Автоустановка .NET не поддерживается для архитектуры ' + process.arch);
    return 'https://aka.ms/dotnet/' + REQUIRED_MAJOR + '.0/dotnet-runtime-' + osName + '-' + arch +
        (IS_WIN ? '.zip' : '.tar.gz');
}

async function downloadWithProgress(url, dest) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('Не удалось скачать .NET Runtime (HTTP ' + res.status + ')');
    const total = Number(res.headers.get('content-length')) || 0;
    let received = 0;
    let lastStep = -1;
    const progress = new Transform({
        transform(chunk, _enc, cb) {
            received += chunk.length;
            if (total) {
                const step = Math.floor(received / total * 10);
                if (step !== lastStep) {
                    lastStep = step;
                    console.log('[ned-import] Загрузка .NET Runtime: ' + step * 10 + '% (' +
                        Math.round(received / 1048576) + ' из ' + Math.round(total / 1048576) + ' МБ)');
                }
            }
            cb(null, chunk);
        }
    });
    await pipeline(Readable.fromWeb(res.body), progress, fs.createWriteStream(dest));
}

async function extractArchive(archive, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    try {
        await run('tar', ['-xf', archive, '-C', destDir], 'Распаковка .NET Runtime');
    } catch (err) {
        if (!IS_WIN) throw err;
        await run('powershell', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', archive, destDir
        ], 'Распаковка .NET Runtime');
    }
}

async function installLocalRuntime() {
    const url = runtimeArchiveUrl();
    console.log('[ned-import] .NET ' + REQUIRED_MAJOR + ' не найден — скачиваю runtime в ' + LOCAL_DOTNET_DIR);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotnet-runtime-'));
    const archive = path.join(tmpDir, IS_WIN ? 'runtime.zip' : 'runtime.tar.gz');
    const stagingDir = LOCAL_DOTNET_DIR + '.partial-' + process.pid;
    try {
        await downloadWithProgress(url, archive);
        await extractArchive(archive, stagingDir);
        // Другой процесс сервера мог успеть установить runtime, пока шла загрузка.
        if (!hasRuntime(LOCAL_DOTNET_EXE)) {
            fs.rmSync(LOCAL_DOTNET_DIR, { recursive: true, force: true });
            fs.renameSync(stagingDir, LOCAL_DOTNET_DIR);
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    if (!hasRuntime(LOCAL_DOTNET_EXE)) throw new Error('.NET Runtime распакован, но не запускается: ' + LOCAL_DOTNET_EXE);
    console.log('[ned-import] .NET Runtime установлен');
}

async function buildFromSource() {
    const sdk = dotnetCandidates().find(hasSdk);
    if (!sdk) {
        throw new Error('Нет собранного конвертера (tools/ned-import/dist) и .NET ' + REQUIRED_MAJOR +
            ' SDK для сборки. Выполните на машине разработчика: npm run ned:build и закоммитьте tools/ned-import/dist');
    }
    console.log('[ned-import] Сборка конвертера NeD…');
    await run(sdk, ['build', PROJECT_DIR, '-c', 'Release', '-nologo', '-v', 'q'], 'Сборка конвертера NeD');
    if (!fs.existsSync(BIN_DLL)) throw new Error('Сборка прошла, но DLL не найдена: ' + BIN_DLL);
    return BIN_DLL;
}

async function prepare() {
    let dll = [DIST_DLL, BIN_DLL].find(function(p) { return fs.existsSync(p); });
    if (!dll) dll = await buildFromSource();

    let dotnet = dotnetCandidates().find(hasRuntime);
    if (!dotnet) {
        await installLocalRuntime();
        dotnet = LOCAL_DOTNET_EXE;
    }
    console.log('[ned-import] Импорт .ned готов');
    return { dotnet: dotnet, dll: dll };
}

/** Готовит .NET и конвертер; параллельные вызовы ждут одну и ту же подготовку. */
function ensureConverterReady() {
    if (!readyPromise) {
        readyPromise = prepare().catch(function(err) {
            readyPromise = null;
            throw err;
        });
    }
    return readyPromise;
}

/** Фоновая подготовка при старте сервера, чтобы первый импорт не ждал загрузки. */
function prepareInBackground() {
    ensureConverterReady().catch(function(err) {
        console.error('[ned-import] Импорт .ned недоступен:', err && err.message ? err.message : err);
    });
}

/**
 * @param {Buffer} nedBuffer
 * @returns {Promise<object[]>}
 */
async function convertNedBuffer(nedBuffer) {
    if (!Buffer.isBuffer(nedBuffer) || nedBuffer.length < 48) {
        throw new Error('Пустой или повреждённый .ned файл');
    }
    const ready = await ensureConverterReady();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ned-import-'));
    const nedPath = path.join(tmpDir, 'project.ned');
    const outPath = path.join(tmpDir, 'map.json');
    try {
        fs.writeFileSync(nedPath, nedBuffer);
        await run(ready.dotnet, [ready.dll, nedPath, outPath], 'Конвертер NeD');
        if (!fs.existsSync(outPath)) throw new Error('Конвертер не создал JSON');
        const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        if (!Array.isArray(data)) throw new Error('Конвертер вернул не массив');
        return data;
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

module.exports = {
    ensureConverterReady: ensureConverterReady,
    prepareInBackground: prepareInBackground,
    convertNedBuffer: convertNedBuffer
};
