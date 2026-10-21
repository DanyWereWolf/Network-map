/**
 * Сборка пакета Portable для выдачи клиенту:
 * - копирует дерево без node_modules / data / рабочего server-config
 * - читает публичный ключ из server/config/portable-license-keypair.json (тот же, что site-admin)
 * - прошивает EMBEDDED_PUBLIC_KEY и portableLicenseRequired: true
 * - пишет INSTALL.md и опционально zip
 *
 * Запуск из корня репо или из Portable:
 *   node Portable/scripts/build-release.js
 *   npm run release   (из Portable/)
 *
 * Опции:
 *   --no-zip          не создавать архив
 *   --out <dir>       каталог вывода (по умолчанию releases/)
 *   --keypair <path>  путь к keypair JSON
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PORTABLE_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(PORTABLE_ROOT, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(PORTABLE_ROOT, 'package.json'), 'utf8'));
const VERSION = String(pkg.version || '0.0.0');

const SKIP_DIR_NAMES = new Set([
    'node_modules',
    'data',
    'dist',
    '.runtime',
    '.git',
    '.cursor',
    'releases'
]);
const SKIP_FILE_NAMES = new Set([
    'server-config.json',
    '_start.err',
    '_start.out',
    '.DS_Store',
    'Thumbs.db'
]);

function parseArgs(argv) {
    var opts = { zip: true, outRoot: path.join(REPO_ROOT, 'releases'), keypair: null };
    for (var i = 0; i < argv.length; i++) {
        var a = argv[i];
        if (a === '--no-zip') opts.zip = false;
        else if (a === '--out' && argv[i + 1]) { opts.outRoot = path.resolve(argv[++i]); }
        else if (a === '--keypair' && argv[i + 1]) { opts.keypair = path.resolve(argv[++i]); }
        else if (a === '--help' || a === '-h') {
            console.log('Usage: node scripts/build-release.js [--no-zip] [--out dir] [--keypair path]');
            process.exit(0);
        }
    }
    return opts;
}

function fail(msg) {
    console.error('[release]', msg);
    process.exit(1);
}

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function rmrf(p) {
    if (!fs.existsSync(p)) return;
    fs.rmSync(p, { recursive: true, force: true });
}

function stamp() {
    var d = new Date();
    function z(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes());
}

function resolveKeypairPath(cliPath) {
    if (cliPath) return cliPath;
    var store = require(path.join(REPO_ROOT, 'server', 'lib', 'portable-license-keypair-store.js'));
    var bundled = store.getBundledKeypairPath();
    if (fs.existsSync(bundled)) return bundled;
    // legacy fallbacks
    var candidates = [
        bundled,
        path.join(REPO_ROOT, 'data', 'portable-license-keypair.json'),
        path.join(PORTABLE_ROOT, 'data', 'portable-license-keypair.json')
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (fs.existsSync(candidates[i])) return candidates[i];
    }
    return bundled;
}

function loadOrCreatePublicKey(keypairPath) {
    var cryptoLib = require(path.join(REPO_ROOT, 'server', 'lib', 'portable-license-crypto.js'));
    ensureDir(path.dirname(keypairPath));
    var kp = cryptoLib.ensureKeypair(keypairPath);
    if (!kp.publicKey) fail('В keypair нет publicKey: ' + keypairPath);
    return { publicKey: String(kp.publicKey).trim(), keypairPath: keypairPath, createdAt: kp.createdAt || null };
}

function shouldSkip(relPosix, name, isDir) {
    if (SKIP_DIR_NAMES.has(name) && isDir) return true;
    if (SKIP_FILE_NAMES.has(name) && !isDir) return true;
    if (name.endsWith('.log')) return true;
    // внутренние артефакты разработки / сборки
    if (relPosix === 'scripts/apply-portable-strip.js') return true;
    if (relPosix === 'scripts/build-release.js') return true;
    return false;
}

function copyTree(srcRoot, destRoot) {
    function walk(rel) {
        var src = path.join(srcRoot, rel);
        var st = fs.statSync(src);
        var name = path.basename(src);
        var relPosix = rel.split(path.sep).join('/');
        if (rel && shouldSkip(relPosix, name, st.isDirectory())) return;
        var dest = path.join(destRoot, rel);
        if (st.isDirectory()) {
            ensureDir(dest);
            fs.readdirSync(src).forEach(function (child) {
                walk(rel ? path.join(rel, child) : child);
            });
            return;
        }
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
    }
    walk('');
}

function patchEmbeddedPublicKey(licenseJsPath, publicKey) {
    var src = fs.readFileSync(licenseJsPath, 'utf8');
    var next = src.replace(
        /const EMBEDDED_PUBLIC_KEY = ['`][^'`]*(['`]);/,
        "const EMBEDDED_PUBLIC_KEY = '" + publicKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "';"
    );
    if (next === src) {
        // fallback: любая пустая константа
        next = src.replace(
            /const EMBEDDED_PUBLIC_KEY = '';/,
            "const EMBEDDED_PUBLIC_KEY = '" + publicKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "';"
        );
    }
    if (next === src) fail('Не удалось прошить EMBEDDED_PUBLIC_KEY в ' + licenseJsPath);
    if (next.indexOf(publicKey) < 0) fail('Публичный ключ не попал в portable-license.js');
    fs.writeFileSync(licenseJsPath, next, 'utf8');
}

function patchExampleConfig(examplePath, publicKey) {
    var cfg = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    cfg.portableLicenseRequired = true;
    cfg.portableLicensePublicKey = publicKey;
    // клиент должен сменить пароль
    if (!cfg.bootstrapAdminPassword || cfg.bootstrapAdminPassword === 'admin123') {
        cfg.bootstrapAdminPassword = 'CHANGE_ME_ON_INSTALL';
    }
    fs.writeFileSync(examplePath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function writeInstallMd(destRoot, meta) {
    var srcPath = path.join(PORTABLE_ROOT, 'INSTALL.md');
    if (!fs.existsSync(srcPath)) fail('Нет Portable/INSTALL.md');
    var stamp = [
        'Версия пакета: **' + meta.version + '**',
        '',
        'Сборка: ' + meta.builtAt,
        ''
    ].join('\n');
    var text = fs.readFileSync(srcPath, 'utf8');
    if (text.indexOf('<!-- RELEASE_META -->') >= 0) {
        text = text.replace('<!-- RELEASE_META -->', stamp);
    } else {
        // вставка после первого заголовка
        text = text.replace(/^(#[^\n]*\n\n)/, '$1' + stamp);
    }
    fs.writeFileSync(path.join(destRoot, 'INSTALL.md'), text, 'utf8');
}

function writeReleaseMeta(destRoot, meta) {
    fs.writeFileSync(path.join(destRoot, 'RELEASE.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

function makeZip(folderPath, zipPath) {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    var parent = path.dirname(folderPath);
    var base = path.basename(folderPath);
    // tar.zip доступен в Windows 10+ и в современных Unix
    var r = spawnSync('tar', ['-a', '-cf', zipPath, '-C', parent, base], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(zipPath)) return true;
    if (process.platform === 'win32') {
        var ps = "Compress-Archive -Path '" + folderPath.replace(/'/g, "''") + "' -DestinationPath '" + zipPath.replace(/'/g, "''") + "' -Force";
        r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
        if (r.status === 0 && fs.existsSync(zipPath)) return true;
        console.warn('[release] zip не создан:', r.stderr || r.stdout || 'unknown');
        return false;
    }
    console.warn('[release] zip не создан (нет tar -a). Папка готова:', folderPath);
    return false;
}

function main() {
    var opts = parseArgs(process.argv.slice(2));
    var keypairPath = resolveKeypairPath(opts.keypair);
    console.log('[release] Keypair:', keypairPath);
    var keyInfo = loadOrCreatePublicKey(keypairPath);
    console.log('[release] Публичный ключ OK' + (keyInfo.createdAt ? (' (keypair: ' + keyInfo.createdAt + ')') : ''));
    console.log('[release] publicKey:', keyInfo.publicKey);
    console.log('[release] Ключ: server/config/portable-license-keypair.json (тот же файл использует site-admin после деплоя кода).');

    var folderName = 'network-map-portable-' + VERSION + '-' + stamp();
    ensureDir(opts.outRoot);
    var outDir = path.join(opts.outRoot, folderName);
    rmrf(outDir);
    ensureDir(outDir);

    console.log('[release] Копирование Portable →', outDir);
    copyTree(PORTABLE_ROOT, outDir);

    var licenseJs = path.join(outDir, 'server', 'lib', 'portable-license.js');
    if (!fs.existsSync(licenseJs)) fail('Нет portable-license.js в сборке');
    patchEmbeddedPublicKey(licenseJs, keyInfo.publicKey);
    console.log('[release] EMBEDDED_PUBLIC_KEY прошит');

    var exampleCfg = path.join(outDir, 'server', 'config', 'server-config.example.json');
    if (!fs.existsSync(exampleCfg)) fail('Нет server-config.example.json');
    patchExampleConfig(exampleCfg, keyInfo.publicKey);
    console.log('[release] example-конфиг: portableLicenseRequired=true');

    // убрать из клиентского README внутренние детали разработки — оставим INSTALL.md как главный
    var meta = {
        name: 'network-map-portable',
        version: VERSION,
        builtAt: new Date().toISOString(),
        license: {
            algorithm: 'ed25519',
            publicKeyEmbedded: true,
            publicKey: keyInfo.publicKey,
            keypairPath: path.relative(REPO_ROOT, keypairPath).split(path.sep).join('/'),
            note: 'Проверка лицензии обязательна. Выдача — site-admin с ТЕМ ЖЕ data/portable-license-keypair.json, иначе подпись не сойдётся.'
        }
    };
    writeInstallMd(outDir, meta);
    writeReleaseMeta(outDir, meta);

    // не тащим локальный README про strip — дополним секцией лицензии в копии
    var readmePath = path.join(outDir, 'README.md');
    if (fs.existsSync(readmePath)) {
        var extra = [
            '',
            '## Лицензия',
            '',
            'Правообладатель: **Volsmap**. Эта сборка требует активации. См. **LICENSE**, **NOTICE**, **INSTALL.md** и страницу `/license.html` после запуска.',
            'Запрещены обратная разработка и передача кода в ИИ-сервисы без разрешения Volsmap.',
            ''
        ].join('\n');
        fs.appendFileSync(readmePath, extra, 'utf8');
    }

    console.log('[release] Папка:', outDir);
    if (opts.zip) {
        var zipPath = outDir + '.zip';
        if (makeZip(outDir, zipPath)) {
            console.log('[release] Архив:', zipPath);
        }
    }
    console.log('[release] Готово. Выдайте клиенту zip/папку и отдельно файл лицензии после получения кода машины.');
}

main();
