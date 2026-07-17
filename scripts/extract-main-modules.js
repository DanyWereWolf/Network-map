/**
 * Extract logical sections from main.js into separate modules.
 * Usage: node scripts/extract-main-modules.js [phase]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const mainPath = path.join(ROOT, 'public', 'js', 'app', 'main.js');
const indexPath = path.join(ROOT, 'public', 'index.html');
const phase = process.argv[2] || '6';

const SCRIPTS_BEFORE_MAIN = [
    'js/app/object-sync.js',
    'js/app/onboarding.js',
    'js/app/user-ui.js',
    'js/app/map-loading.js',
    'js/app/backups.js',
    'js/app/cable-split-sleeve.js',
    'js/app/map-hover.js',
    'js/app/object-placement.js',
    'js/app/edit-mode.js',
    'js/app/map-init.js',
    'js/app/map-clicks.js',
    'js/app/create-object.js',
    'js/app/cable-routing.js',
    'js/app/fiber-scheme.js',
    'js/app/object-delete.js',
    'js/app/map-selection.js',
    'js/app/gpon-fiber.js',
    'js/app/map-geometry.js',
    'js/app/map-object-core.js',
    'js/app/map-persistence.js',
    'js/app/cable-laying.js',
    'js/app/cable-helpers.js',
    'js/app/object-modals.js',
    'js/app/fiber-modal-handlers.js',
    'js/app/fiber-labels.js',
    'js/app/fiber-trace.js',
    'js/app/fiber-routing-modals.js'
];

const PHASES = {
    '5': {
        modules: [
            {
                file: 'public/js/app/cable-laying.js',
                header: '/**\n * Прокладка кабелей: createCableFromPoints, sync op.\n */\n',
                ranges: [[74, 410]]
            },
            {
                file: 'public/js/app/cable-helpers.js',
                header: '/**\n * Вспомогательные функции кабелей и меди.\n */\n',
                ranges: [[412, 817]]
            },
            {
                file: 'public/js/app/object-modals.js',
                header: '/**\n * Карточки объектов и кабелей, модальное окно infoModal.\n */\n',
                ranges: [[819, 5114]]
            },
            {
                file: 'public/js/app/fiber-modal-handlers.js',
                header: '/**\n * Обработчики сращивания жил в модалке кросса/муфты.\n */\n',
                ranges: [[5116, 6421]]
            },
            {
                file: 'public/js/app/fiber-labels.js',
                header: '/**\n * Подписи жил и сращиваний на схеме.\n */\n',
                ranges: [[6423, 7051]]
            },
            {
                file: 'public/js/app/fiber-trace.js',
                header: '/**\n * Трассировка жил и модальное окно трассировки.\n */\n',
                ranges: [[7084, 8973]]
            },
            {
                file: 'public/js/app/fiber-routing-modals.js',
                header: '/**\n * Модалки назначения жил: узел, ONU, сплиттер, GPON-маршрут.\n */\n',
                ranges: [[8975, 9813]]
            }
        ],
        extraScripts: [
            'js/app/cable-laying.js',
            'js/app/cable-helpers.js',
            'js/app/object-modals.js',
            'js/app/fiber-modal-handlers.js',
            'js/app/fiber-labels.js',
            'js/app/fiber-trace.js',
            'js/app/fiber-routing-modals.js'
        ]
    },
    '6': {
        modules: [
            {
                file: 'public/js/app/map-object-core.js',
                header: '/**\n * uniqueId объектов, mapPerf.\n */\n',
                ranges: [[74, 103], [1719, 1721]]
            },
            {
                file: 'public/js/app/fiber-routing-map.js',
                header: '/**\n * Прокладка GPON-жил и сплиттер-маршрутов по карте.\n */\n',
                ranges: [[105, 395]]
            },
            {
                file: 'public/js/app/gpon-connect-modals.js',
                header: '/**\n * Модалки подключения жил к OLT, ONU, узлу.\n */\n',
                ranges: [[396, 803]]
            },
            {
                file: 'public/js/app/connection-lines.js',
                header: '/**\n * Линии GPON-связей на карте.\n */\n',
                ranges: [[804, 1718]]
            },
            {
                file: 'public/js/app/fiber-trace-extra.js',
                header: '/**\n * Доп. трассировка: узлы, OLT, show-on-map.\n */\n',
                ranges: [[1723, 2394]]
            },
            {
                file: 'public/js/app/fiber-selection-ui.js',
                header: '/**\n * Панель выбора жилы для сращивания.\n */\n',
                ranges: [[2396, 2470]]
            },
            {
                file: 'public/js/app/cable-delete.js',
                header: '/**\n * Удаление кабелей с карты.\n */\n',
                ranges: [[2471, 2707]]
            },
            {
                file: 'public/js/app/cable-fiber-utils.js',
                header: '/**\n * Жилы кабеля: usedFibers, группы, связанные кабели.\n */\n',
                ranges: [[2709, 2840]]
            },
            {
                file: 'public/js/app/cross-node-display.js',
                header: '/**\n * Группы кроссов/узлов на карте, подписи.\n */\n',
                ranges: [[2841, 3407]]
            },
            {
                file: 'public/js/app/regions-ui.js',
                header: '/**\n * UI регионов: рисование, боковая панель.\n */\n',
                ranges: [[3408, 3909]]
            },
            {
                file: 'public/js/app/map-filter.js',
                header: '/**\n * Фильтр объектов на карте, expert zoom.\n */\n',
                ranges: [[3940, 4357]]
            },
            {
                file: 'public/js/app/fiber-workspace.js',
                header: '/**\n * Рабочее место жил: SVG-схема, sidebar, раскладка.\n */\n',
                ranges: [[4359, 5827]]
            }
        ],
        extraScripts: [
            'js/app/fiber-routing-map.js',
            'js/app/gpon-connect-modals.js',
            'js/app/connection-lines.js',
            'js/app/fiber-trace-extra.js',
            'js/app/fiber-selection-ui.js',
            'js/app/cable-delete.js',
            'js/app/cable-fiber-utils.js',
            'js/app/cross-node-display.js',
            'js/app/regions-ui.js',
            'js/app/map-filter.js',
            'js/app/fiber-workspace.js'
        ]
    }
};

const config = PHASES[phase];
if (!config) {
    console.error('Unknown phase:', phase);
    process.exit(1);
}

const lines = fs.readFileSync(mainPath, 'utf8').split(/\r?\n/);

function sliceRange(start, end) {
    return lines.slice(start - 1, end).join('\n');
}

function buildRemovedSet(ranges) {
    const removed = new Set();
    for (const [start, end] of ranges) {
        for (let i = start; i <= end; i++) removed.add(i - 1);
    }
    return removed;
}

const allRanges = config.modules.flatMap(function (m) { return m.ranges; });

for (const mod of config.modules) {
    const parts = mod.ranges.map(function (r) { return sliceRange(r[0], r[1]); });
    const content = mod.header + parts.join('\n\n') + '\n';
    const outPath = path.join(ROOT, mod.file);
    fs.writeFileSync(outPath, content, 'utf8');
    console.log('Wrote', mod.file, '(' + content.length + ' bytes)');
}

const removed = buildRemovedSet(allRanges);
const newMainLines = lines.filter(function (_, i) { return !removed.has(i); });
fs.writeFileSync(mainPath, newMainLines.join('\n') + '\n', 'utf8');
console.log('Updated main.js:', newMainLines.length, 'lines (was', lines.length + ')');

const allScripts = SCRIPTS_BEFORE_MAIN.concat(config.extraScripts || []);
const scriptLines = allScripts.map(function (src) {
    return '    <script src="' + src + '"></script>';
});
scriptLines.push('    <script src="js/app/main.js"></script>');

let indexHtml = fs.readFileSync(indexPath, 'utf8');
const scriptBlock = scriptLines.join('\n');
indexHtml = indexHtml.replace(
    / {4}<script src="js\/app\/object-sync\.js"><\/script>\n(?: {4}<script src="js\/app\/[^"]+\.js"><\/script>\n)* {4}<script src="js\/app\/main\.js"><\/script>/,
    scriptBlock
);
fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('Updated index.html (' + allScripts.length + ' modules before main.js)');
