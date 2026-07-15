/**
 * Production client build: copy public/ → dist/ and obfuscate all JS.
 * Dev continues to edit public/; production serves dist/ when serveObfuscatedClient is on.
 *
 * Usage: node scripts/build-client.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'dist');

/** Safe for classic multi-file globals (renameGlobals stays false). */
const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.4,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    splitStrings: true,
    splitStringsChunkLength: 8,
    numbersToExpressions: true,
    simplify: true
};

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

function obfuscateFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS);
    fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
}

function main() {
    if (!fs.existsSync(SRC)) {
        console.error('[build-client] Не найден каталог public/');
        process.exit(1);
    }

    console.log('[build-client] Очистка dist/…');
    rmDir(OUT);

    console.log('[build-client] Копирование public/ → dist/…');
    copyDir(SRC, OUT);

    const jsDir = path.join(OUT, 'js');
    if (!fs.existsSync(jsDir)) {
        console.error('[build-client] В dist/ нет js/');
        process.exit(1);
    }

    const files = collectJsFiles(jsDir, []);
    console.log('[build-client] Обфускация ' + files.length + ' JS-файлов…');

    let ok = 0;
    let failed = 0;
    const t0 = Date.now();
    for (const file of files) {
        const rel = path.relative(OUT, file);
        try {
            obfuscateFile(file);
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
