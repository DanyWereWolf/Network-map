'use strict';

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');
const CONFIG_PATH = path.join(ROOT, 'server-config.json');
const CONFIG_EXAMPLE_PATH = path.join(ROOT, 'server', 'config', 'server-config.example.json');

const BASE_OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.85,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    splitStrings: true,
    splitStringsChunkLength: 8,
    numbersToExpressions: true,
    simplify: true,
    target: 'browser'
};

function parseArgs(argv) {
    var noDomainLock = false;
    for (var i = 2; i < argv.length; i++) {
        if (argv[i] === '--no-domain-lock') noDomainLock = true;
        else if (argv[i] === '--help' || argv[i] === '-h') {
            console.log('Usage: node scripts/build-client.js [--no-domain-lock]');
            process.exit(0);
        }
    }
    return { noDomainLock: noDomainLock };
}

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
}

function hostToDomainLockEntry(hostname) {
    var h = String(hostname || '')
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, '');
    if (!h || h === 'localhost' || h === '127.0.0.1') return null;
    if (h.charAt(0) === '.') return h;
    var parts = h.split('.').filter(Boolean);
    if (parts.length >= 2) {
        return '.' + parts.slice(-2).join('.');
    }
    return '.' + h;
}

function resolveDomainLock(noDomainLock) {
    if (noDomainLock) {
        return { domains: [], redirectUrl: '' };
    }
    var envLock = String(process.env.DOMAIN_LOCK || '').trim();
    var envUrl = String(process.env.PUBLIC_SITE_URL || '').trim();
    var cfg = readJsonSafe(CONFIG_PATH) || readJsonSafe(CONFIG_EXAMPLE_PATH) || {};
    var siteUrl = envUrl || String(cfg.publicSiteUrl || '').trim();

    var domains = [];
    if (envLock) {
        domains = envLock.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    } else if (siteUrl) {
        try {
            var u = new URL(siteUrl.indexOf('://') === -1 ? 'https://' + siteUrl : siteUrl);
            var entry = hostToDomainLockEntry(u.hostname);
            if (entry) domains.push(entry);
        } catch (e) {
        }
    }

    var redirectUrl = siteUrl || '';
    if (redirectUrl && redirectUrl.indexOf('://') === -1) {
        redirectUrl = 'https://' + redirectUrl;
    }
    if (redirectUrl && redirectUrl.slice(-1) !== '/') {
        redirectUrl += '/';
    }

    return { domains: domains, redirectUrl: redirectUrl || 'about:blank' };
}

function buildObfuscatorOptions(domainLock) {
    var opts = Object.assign({}, BASE_OBFUSCATOR_OPTIONS);
    if (domainLock.domains && domainLock.domains.length) {
        opts.domainLock = domainLock.domains.slice();
        opts.domainLockRedirectUrl = domainLock.redirectUrl || 'about:blank';
    }
    return opts;
}

function rmDir(dir) {
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

function collectJsFiles(dir, list) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(full, list);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            list.push(full);
        }
    }
    return list;
}

function obfuscateFile(filePath, options) {
    const code = fs.readFileSync(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, options);
    fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
}

function main() {
    const args = parseArgs(process.argv);
    if (!fs.existsSync(SRC)) {
        console.error('[build-client] Не найден каталог public/');
        process.exit(1);
    }

    const domainLock = resolveDomainLock(args.noDomainLock);
    const obfuscatorOptions = buildObfuscatorOptions(domainLock);

    console.log('[build-client] Очистка dist/…');
    rmDir(OUT);

    console.log('[build-client] Копирование public/ → dist/…');
    copyDir(SRC, OUT);

    const jsDir = path.join(OUT, 'js');
    if (!fs.existsSync(jsDir)) {
        console.error('[build-client] В dist/ нет js/');
        process.exit(1);
    }

    if (domainLock.domains.length) {
        console.log(
            '[build-client] domainLock: ' +
                domainLock.domains.join(', ') +
                ' → ' +
                domainLock.redirectUrl
        );
    } else {
        console.warn(
            '[build-client] domainLock выключен (нет publicSiteUrl / DOMAIN_LOCK или --no-domain-lock). ' +
                'Скопированный JS сможет работать на чужом домене.'
        );
    }

    const files = collectJsFiles(jsDir, []);
    console.log('[build-client] Обфускация ' + files.length + ' JS-файлов (rc4 + control-flow)…');

    let ok = 0;
    let failed = 0;
    const t0 = Date.now();
    for (const file of files) {
        const rel = path.relative(OUT, file);
        try {
            obfuscateFile(file, obfuscatorOptions);
            ok += 1;
            process.stdout.write('  ✓ ' + rel + '\n');
        } catch (err) {
            failed += 1;
            console.error('  ✗ ' + rel + ': ' + (err && err.message ? err.message : err));
        }
    }

    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('[build-client] Готово: ' + ok + ' ok, ' + failed + ' errors, ' + sec + 's');
    console.log('[build-client] Включите в server-config.json: "serveObfuscatedClient": true');
    if (failed) process.exit(1);
}

main();
