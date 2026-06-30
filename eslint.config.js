const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');
const fs = require('fs');
const path = require('path');

function walkJs(dir, out) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walkJs(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
}

/** Глобалы из public/js/core/state.js — общее состояние карты. */
function readStateGlobals() {
    const statePath = path.join(__dirname, 'public', 'js', 'core', 'state.js');
    const out = {};
    if (!fs.existsSync(statePath)) return out;
    const text = fs.readFileSync(statePath, 'utf8');
    const re = /^var\s+([A-Za-z_$][\w$]*)\b/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
        out[m[1]] = 'writable';
    }
    return out;
}

/** Все top-level объявления в public/js — для no-undef между script-тегами. */
function readClientDeclaredGlobals() {
    const jsRoot = path.join(__dirname, 'public', 'js');
    const files = [];
    walkJs(jsRoot, files);
    const out = {};
    const linePatterns = [
        /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
        /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/,
        /^window\.([A-Za-z_$][\w$]*)\s*=/,
        /^global\.([A-Za-z_$][\w$]*)\s*=/
    ];
    for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;
            for (const re of linePatterns) {
                const m = trimmed.match(re);
                if (m) out[m[1]] = 'readonly';
            }
        }
    }
    return out;
}

const clientGlobals = {
    ...globals.browser,
    ...readClientDeclaredGlobals(),
    ...readStateGlobals(),
    ymaps: 'readonly',
    Quill: 'readonly',
    AuthSystem: 'writable',
    loadAppScript: 'writable',
    loadAppScripts: 'writable',
    MAP_CORE_DEFERRED_SCRIPTS: 'writable',
    MAP_UI_DEFERRED_SCRIPTS: 'writable',
    MAP_BACKGROUND_SCRIPTS: 'writable',
    CableUnderground: 'writable',
    MapLegendConfig: 'writable',
    MapIcons: 'writable',
    MapPerf: 'writable',
    FiberCableConfig: 'writable',
    MapRegions: 'writable',
    CameraPlayer: 'writable',
    NewsEditor: 'writable',
    deviceCatalogActiveTab: 'writable',
    APP_VERSION: 'readonly'
};

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'data/**',
            '**/*.min.js'
        ]
    },
    js.configs.recommended,
    prettier,
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: clientGlobals
        },
        rules: {
            // Глобалы между <script>-тегами — scripts/find-dead-globals.js; no-undef даёт ложные срабатывания
            'no-undef': 'off',
            'no-global-assign': 'off',
            // Топ-уровневые function/var в script-тегах — через scripts/find-dead-globals.js
            'no-unused-vars': [
                'warn',
                {
                    vars: 'local',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'none',
                    ignoreRestSiblings: true
                }
            ],
            'no-unreachable': 'warn',
            'no-constant-condition': ['warn', { checkLoops: false }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-dupe-keys': 'warn',
            'no-duplicate-case': 'warn',
            'preserve-caught-error': 'off',
            'no-self-assign': 'warn',
            'no-useless-escape': 'off',
            'no-redeclare': 'warn',
            'no-useless-assignment': 'off'
        }
    },
    {
        files: ['eslint.config.js', '*.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        }
    },
    {
        files: ['server/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'none',
                    ignoreRestSiblings: true
                }
            ],
            'no-unreachable': 'warn',
            'no-constant-condition': ['warn', { checkLoops: false }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-dupe-keys': 'warn',
            'no-duplicate-case': 'warn',
            'preserve-caught-error': 'off',
            'no-self-assign': 'warn',
            'no-redeclare': 'warn',
            'no-useless-assignment': 'off'
        }
    }
];
