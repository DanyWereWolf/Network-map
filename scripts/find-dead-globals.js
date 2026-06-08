/**
 * Поиск неиспользуемых top-level символов в проекте без ES-модулей.
 * Сканирует function/var/const и window/global-экспорты, считает вхождения по всем .js и .html.
 *
 * Запуск: npm run dead-code
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const SCAN_DIRS = [
    path.join(ROOT, 'public', 'js'),
    path.join(ROOT, 'server'),
    path.join(ROOT, 'scripts')
];

const HTML_DIR = path.join(ROOT, 'public');

/** Имена, которые не считаем мёртвым кодом (внешние API, точки входа). */
const BUILTIN_IGNORE = new Set([
    'require',
    'module',
    'exports',
    '__dirname',
    '__filename',
    'process',
    'console',
    'Buffer',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'Promise',
    'fetch',
    'URL',
    'URLSearchParams',
    'FormData',
    'AbortController',
    'TextEncoder',
    'TextDecoder',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Symbol',
    'Proxy',
    'Reflect',
    'JSON',
    'Math',
    'Date',
    'RegExp',
    'Error',
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'encodeURIComponent',
    'decodeURIComponent',
    'document',
    'window',
    'navigator',
    'location',
    'history',
    'localStorage',
    'sessionStorage',
    'HTMLElement',
    'Element',
    'Node',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'MutationObserver',
    'IntersectionObserver',
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
    'matchMedia',
    'alert',
    'confirm',
    'prompt',
    'open',
    'close',
    'print',
    'atob',
    'btoa',
    'structuredClone',
    'queueMicrotask',
    'performance',
    'crypto',
    'Intl',
    'ymaps'
]);

function walk(dir, exts, out) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p, exts, out);
        else if (exts.some((ext) => name.endsWith(ext))) out.push(p);
    }
}

function rel(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/');
}

function collectFiles() {
    const js = [];
    const html = [];
    for (const dir of SCAN_DIRS) walk(dir, ['.js'], js);
    walk(HTML_DIR, ['.html'], html);
    return { js, html };
}

/**
 * @returns {{ name: string, file: string, line: number, kind: string }[]}
 */
function extractSymbols(file, content) {
    const lines = content.split(/\r?\n/);
    const symbols = [];
    const patterns = [
        { kind: 'function', re: /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/ },
        { kind: 'var-fn', re: /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/ },
        { kind: 'var-arrow', re: /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/ },
        { kind: 'var-arrow', re: /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/ },
        { kind: 'window-export', re: /^window\.([A-Za-z_$][\w$]*)\s*=/ },
        { kind: 'global-export', re: /^global\.([A-Za-z_$][\w$]*)\s*=/ }
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        for (const { kind, re } of patterns) {
            const m = trimmed.match(re);
            if (!m) continue;
            const name = m[1];
            if (name.startsWith('_')) continue;
            symbols.push({ name, file, line: i + 1, kind });
        }
    }

    return symbols;
}

function buildCorpus(fileContents) {
    return [...fileContents.values()].join('\n\n');
}

function countOccurrences(name, corpus) {
    const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g');
    const matches = corpus.match(re);
    return matches ? matches.length : 0;
}

function countOccurrencesInFile(name, content) {
    const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b', 'g');
    const matches = content.match(re);
    return matches ? matches.length : 0;
}

function main() {
    const { js, html } = collectFiles();
    const allFiles = [...js, ...html];
    const fileContents = new Map(allFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));
    const corpus = buildCorpus(fileContents);

    const symbolDefs = [];
    const seen = new Set();

    for (const file of js) {
        const r = rel(file);
        if (r === 'scripts/find-dead-globals.js') continue;
        const content = fileContents.get(file);
        for (const sym of extractSymbols(file, content)) {
            const key = sym.name + '@' + rel(file) + ':' + sym.line;
            if (seen.has(key)) continue;
            seen.add(key);
            symbolDefs.push(sym);
        }
    }

    const dead = [];

    for (const sym of symbolDefs) {
        if (BUILTIN_IGNORE.has(sym.name)) continue;

        const total = countOccurrences(sym.name, corpus);
        const local = countOccurrencesInFile(sym.name, fileContents.get(sym.file));

        if (total <= 1) {
            dead.push({ ...sym, total, local });
            continue;
        }

        // Только в файле определения и ровно одно вхождение — тоже мёртвый
        if (total === local && local === 1) {
            dead.push({ ...sym, total, local });
            continue;
        }

    }

    dead.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

    const byFile = new Map();
    for (const item of dead) {
        const r = rel(item.file);
        if (!byFile.has(r)) byFile.set(r, []);
        byFile.get(r).push(item);
    }

    console.log('=== Неиспользуемые top-level символы (0 ссылок вне определения) ===\n');

    if (dead.length === 0) {
        console.log('Не найдено.\n');
    } else {
        for (const [file, items] of byFile) {
            console.log(file + ':');
            for (const item of items) {
                console.log('  L' + item.line + '  ' + item.kind.padEnd(14) + '  ' + item.name);
            }
            console.log('');
        }
        console.log('Итого: ' + dead.length + ' символ(ов)\n');
    }

    const unusedFiles = findUnreferencedJsFiles(js, html, fileContents);
    if (unusedFiles.length > 0) {
        console.log('=== JS-файлы без ссылок из HTML и других entry-скриптов ===\n');
        for (const f of unusedFiles) console.log('  ' + rel(f));
        console.log('\nИтого: ' + unusedFiles.length + ' файл(ов)\n');
    }

    process.exit(dead.length > 0 ? 1 : 0);
}

/** Файлы, на которые нет <script src> и нет loadAppScript('...') в коде. */
function findUnreferencedJsFiles(jsFiles, htmlFiles, fileContents) {
    const refs = new Set();

    for (const html of htmlFiles) {
        const content = fileContents.get(html);
        const patterns = [
            /<script[^>]*\ssrc=["']([^"']+\.js)["']/gi,
            /\bloadAppScript\s*\(\s*['"]([^'"]+\.js)['"]/g
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) {
                refs.add(normalizeJsRef(m[1]));
            }
        }
    }

    for (const file of jsFiles) {
        const content = fileContents.get(file);
        const patterns = [
            /loadAppScript\s*\(\s*['"]([^'"]+\.js)['"]/g,
            /require\s*\(\s*['"](\.[^'"]+)['"]/g
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) {
                const ref = m[1].startsWith('.') ? resolveRequirePath(file, m[1]) : normalizeJsRef(m[1]);
                if (ref) refs.add(ref);
            }
        }
        for (const key of ['MAP_CORE_DEFERRED_SCRIPTS', 'MAP_UI_DEFERRED_SCRIPTS', 'MAP_BACKGROUND_SCRIPTS']) {
            const arrRe = new RegExp(key + '\\s*=\\s*\\[([^\\]]+)\\]', 's');
            const arrM = content.match(arrRe);
            if (arrM) {
                const inner = arrM[1];
                const itemRe = /['"]([^'"]+\.js)['"]/g;
                let im;
                while ((im = itemRe.exec(inner)) !== null) refs.add(normalizeJsRef(im[1]));
            }
        }
    }

    const entryAlways = new Set([
        'public/js/app/main.js',
        'public/js/app/auth.js',
        'server/server-api.js',
        'server/server.js',
        'scripts/check-js-syntax.js',
        'scripts/find-dead-globals.js'
    ]);

    return jsFiles.filter((file) => {
        const r = rel(file);
        if (entryAlways.has(r)) return false;
        return !refs.has(r);
    });
}

function resolveRequirePath(fromFile, reqPath) {
    let candidate = path.join(path.dirname(fromFile), reqPath);
    if (!candidate.endsWith('.js')) candidate += '.js';
    if (!fs.existsSync(candidate)) return null;
    return rel(path.normalize(candidate));
}

function normalizeJsRef(ref) {
    let r = ref.replace(/^\//, '');
    if (!r.startsWith('public/') && !r.startsWith('server/') && !r.startsWith('scripts/')) {
        r = 'public/' + r;
    }
    return r;
}

main();
