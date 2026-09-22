/** ВОЛС: вид линии на карте (цвет/толщина организации) и настраиваемые жилы. */
(function(global) {
    var MAP_FIBER_COLOR = '#16a34a';
    var MAP_FIBER_WIDTH = 3;
    var MIN_MAP_STROKE_WIDTH = 1;
    var MAX_MAP_STROKE_WIDTH = 8;
    var MAX_FIBERS = 96;
    var LAY_FIBER_COUNT_KEY = 'networkMap_layFiberCount';
    var LAY_FIBER_PALETTE_KEY = 'networkMap_layFiberPalette';
    var LAY_FIBERS_PER_MODULE_KEY = 'networkMap_layFibersPerModule';
    var LAY_MODULE_COUNT_KEY = 'networkMap_layModuleCount';
    var MODULE_SIZE_PRESETS = [4, 6, 8, 12, 16];
    var DEFAULT_FIBERS_PER_MODULE = 12;
    /** Типовые многомодульные ВОЛС (модули × жил в модуле), ёмкостью до 96. */
    var MODULAR_CABLE_PRESETS = [
        { id: '2x6', modules: 2, perModule: 6, label: '2×6' },
        { id: '2x12', modules: 2, perModule: 12, label: '2×12' },
        { id: '3x12', modules: 3, perModule: 12, label: '3×12' },
        { id: '4x6', modules: 4, perModule: 6, label: '4×6' },
        { id: '4x8', modules: 4, perModule: 8, label: '4×8' },
        { id: '4x12', modules: 4, perModule: 12, label: '4×12' },
        { id: '4x16', modules: 4, perModule: 16, label: '4×16' },
        { id: '6x8', modules: 6, perModule: 8, label: '6×8' },
        { id: '6x12', modules: 6, perModule: 12, label: '6×12' },
        { id: '6x16', modules: 6, perModule: 16, label: '6×16' },
        { id: '8x12', modules: 8, perModule: 12, label: '8×12' }
    ];
    var MODULE_TUBE_COLORS = [
        '#2563eb', '#ea580c', '#16a34a', '#a16207',
        '#64748b', '#e11d48', '#7c3aed', '#0891b2',
        '#ca8a04', '#334155', '#db2777', '#0d9488'
    ];
    var LEGACY_TYPE_COUNTS = { fiber4: 4, fiber8: 8, fiber16: 16, fiber24: 24 };
    var BASE_COLORS = [
        { name: 'Синий', color: '#0000FF' }, { name: 'Оранжевый', color: '#FF8C00' },
        { name: 'Зеленый', color: '#00FF00' }, { name: 'Коричневый', color: '#8B4513' },
        { name: 'Серый', color: '#808080' }, { name: 'Белый', color: '#FFFFFF' },
        { name: 'Красный', color: '#FF0000' }, { name: 'Черный', color: '#000000' },
        { name: 'Желтый', color: '#FFFF00' }, { name: 'Фиолетовый', color: '#800080' },
        { name: 'Розовый', color: '#FFC0CB' }, { name: 'Бирюзовый', color: '#00CED1' }
    ];

    function esc(t) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(t);
        return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isOpticalCableType(type) {
        return type && type !== 'copper' && (type === 'fiber' || type === 'fiberModular' || !!LEGACY_TYPE_COUNTS[type]);
    }

    function isModularCableType(type) {
        return type === 'fiberModular';
    }

    function countFromLegacyType(type) {
        return LEGACY_TYPE_COUNTS[type] || 0;
    }

    function buildStandardPalette(count) {
        var n = Math.max(1, Math.min(MAX_FIBERS, count || 24));
        var out = [];
        for (var i = 0; i < n; i++) {
            var base = BASE_COLORS[i % 12];
            var ring = i >= 12;
            out.push({
                number: i + 1,
                name: ring ? base.name + ' (с черн. кольцом)' : base.name,
                color: base.color,
                hasBlackRing: ring
            });
        }
        return out;
    }

    function normalizePaletteEntry(f, index) {
        var num = f && f.number != null ? parseInt(f.number, 10) : index + 1;
        if (isNaN(num) || num < 1) num = index + 1;
        return {
            number: num,
            name: (f && f.name) ? String(f.name) : 'Жила ' + num,
            color: (f && f.color) ? String(f.color) : '#888888',
            hasBlackRing: !!(f && f.hasBlackRing)
        };
    }

    function normalizePalette(arr) {
        return Array.isArray(arr) && arr.length ? arr.map(normalizePaletteEntry) : [];
    }

    function getFiberCountFromCable(cable) {
        if (!cable || !cable.properties) return 0;
        var n = cable.properties.get('fiberCount');
        if (n != null && n !== '') {
            n = parseInt(n, 10);
            if (!isNaN(n) && n > 0) return Math.min(MAX_FIBERS, n);
        }
        var legacy = countFromLegacyType(cable.properties.get('cableType'));
        if (legacy > 0) return legacy;
        if (cable.properties.get('cableType') === 'fiber') return 4;
        return 0;
    }

    function getFiberCountFromType(type) {
        if (type === 'fiber' || type === 'fiberModular') return getLayFiberCount();
        return countFromLegacyType(type) || 0;
    }

    function getFiberCount(arg) {
        if (arg && arg.properties && arg.properties.get('type') === 'cable') {
            return getFiberCountFromCable(arg);
        }
        return getFiberCountFromType(arg);
    }

    function trimPaletteToCount(palette, count) {
        if (!Array.isArray(palette) || !palette.length) return [];
        var pal = normalizePalette(palette);
        var n = Math.max(1, Math.min(MAX_FIBERS, parseInt(count, 10) || 1));
        return pal.length > n ? pal.slice(0, n) : pal;
    }

    function getFiberPaletteForCable(cable) {
        if (!cable || !cable.properties) return [];
        var c = getFiberCountFromCable(cable);
        var custom = cable.properties.get('fiberPalette');
        if (Array.isArray(custom) && custom.length) {
            return c > 0 ? trimPaletteToCount(custom, c) : normalizePalette(custom);
        }
        return c > 0 ? buildStandardPalette(c) : [];
    }

    function getFiberColors(arg) {
        if (arg && arg.properties && arg.properties.get('type') === 'cable') {
            return getFiberPaletteForCable(arg);
        }
        if (arg === 'copper') {
            return [{ number: 1, name: 'Линия', color: '#b45309', hasBlackRing: false }];
        }
        var count = getFiberCountFromType(arg);
        return count > 0 ? buildStandardPalette(count) : [];
    }

    function pluralFibers(n) {
        var m = Math.abs(n) % 100;
        var m10 = m % 10;
        if (m > 10 && m < 20) return 'жил';
        if (m10 === 1) return 'жила';
        if (m10 >= 2 && m10 <= 4) return 'жилы';
        return 'жил';
    }

    function getCableLabel(cableOrType, cableMaybe) {
        var cable = cableOrType && cableOrType.properties ? cableOrType : cableMaybe;
        var type = cable ? cable.properties.get('cableType') : cableOrType;
        if (type === 'copper') return 'Медный кабель';
        var count = cable ? getFiberCountFromCable(cable) : getFiberCountFromType(type);
        if (count <= 0) return isModularCableType(type) ? 'ВОЛС модульный' : 'ВОЛС';
        var mpm = cable ? getFibersPerModuleFromCable(cable) : (isModularCableType(type) ? DEFAULT_FIBERS_PER_MODULE : 0);
        if (mpm > 0 || isModularCableType(type)) {
            var mods = getModuleCount(count, mpm || DEFAULT_FIBERS_PER_MODULE);
            return 'ВОЛС модульный, ' + count + ' ' + pluralFibers(count) + ' · ' + mods + '×' + (mpm || DEFAULT_FIBERS_PER_MODULE);
        }
        return 'ВОЛС, ' + count + ' ' + pluralFibers(count);
    }

    function getLayFiberCount() {
        var el = document.getElementById('layFiberCount');
        if (el) {
            var v = parseInt(el.value, 10);
            if (!isNaN(v) && v >= 1) return Math.min(MAX_FIBERS, v);
        }
        try {
            var s = parseInt(localStorage.getItem(LAY_FIBER_COUNT_KEY), 10);
            if (!isNaN(s) && s >= 1) return Math.min(MAX_FIBERS, s);
        } catch (e) {}
        return 4;
    }

    function setLayFiberCount(n) {
        var v = Math.max(1, Math.min(MAX_FIBERS, parseInt(n, 10) || 4));
        var el = document.getElementById('layFiberCount');
        if (el) el.value = String(v);
        try { localStorage.setItem(LAY_FIBER_COUNT_KEY, String(v)); } catch (e) {}
        syncLayFiberPresetsUI();
        syncLayPaletteButtonState();
        return v;
    }

    function syncLayFiberPresetsUI() {
        var count = getLayFiberCount();
        document.querySelectorAll('.cable-fiber-preset').forEach(function(btn) {
            if (btn.classList.contains('cable-module-size-preset')) return;
            btn.classList.toggle('cable-fiber-preset--active', parseInt(btn.getAttribute('data-count'), 10) === count);
        });
    }

    function getLayFiberPalette() {
        try {
            var raw = localStorage.getItem(LAY_FIBER_PALETTE_KEY);
            if (!raw) return null;
            var p = JSON.parse(raw);
            if (Array.isArray(p) && p.length) return normalizePalette(p);
        } catch (e) {}
        return null;
    }

    function setLayFiberPalette(palette) {
        try {
            if (!palette || !palette.length) localStorage.removeItem(LAY_FIBER_PALETTE_KEY);
            else {
                var trimmed = trimPaletteToCount(palette, getLayFiberCount());
                localStorage.setItem(LAY_FIBER_PALETTE_KEY, JSON.stringify(trimmed));
            }
        } catch (e) {}
        syncLayPaletteButtonState();
    }

    function normalizeMapColor(val) {
        if (val == null || val === '') return MAP_FIBER_COLOR;
        var s = String(val).trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
        if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
            return ('#' + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3)).toLowerCase();
        }
        return MAP_FIBER_COLOR;
    }

    function normalizeMapStrokeWidth(val) {
        var n = parseInt(val, 10);
        if (isNaN(n)) return MAP_FIBER_WIDTH;
        return Math.max(MIN_MAP_STROKE_WIDTH, Math.min(MAX_MAP_STROKE_WIDTH, n));
    }

    function getOrgFiberMapColor() {
        return MAP_FIBER_COLOR;
    }

    function getOrgFiberMapStrokeWidth() {
        return MAP_FIBER_WIDTH;
    }

    function syncFiberMapCssVar() {
        try {
            if (document.documentElement) {
                document.documentElement.style.setProperty('--fiber-map-line', MAP_FIBER_COLOR);
            }
        } catch (eCss) {}
    }

    function syncLayMapStylePreview() {
        var line = document.querySelector('.cable-lay-fiber-line');
        if (!line) return;
        line.style.background = MAP_FIBER_COLOR;
        line.style.height = Math.max(2, MAP_FIBER_WIDTH) + 'px';
        line.style.boxShadow = '0 0 0 1px color-mix(in srgb, ' + MAP_FIBER_COLOR + ' 35%, transparent)';
    }

    function syncThemeFiberMapControls() {
        var colorEl = document.getElementById('themeFiberMapColor');
        var widthEl = document.getElementById('themeFiberMapStrokeWidth');
        var widthVal = document.getElementById('themeFiberMapStrokeWidthVal');
        if (colorEl) colorEl.value = MAP_FIBER_COLOR;
        if (widthEl) widthEl.value = String(MAP_FIBER_WIDTH);
        if (widthVal) widthVal.textContent = String(MAP_FIBER_WIDTH);
    }

    function applyOpticalMapStyle(cable) {
        if (!cable || !cable.options) return;
        if (!isOpticalCableType(cable.properties.get('cableType'))) return;
        cable.options.set({
            strokeColor: MAP_FIBER_COLOR,
            strokeWidth: MAP_FIBER_WIDTH,
            strokeOpacity: 0.72
        });
        if (cable.properties && cable.properties.get('originalCableOptions')) {
            try { cable.properties.unset('originalCableOptions'); } catch (eOrig) {}
        }
        if (global.CableUnderground && typeof global.CableUnderground.syncAerialOverlayStroke === 'function') {
            try { global.CableUnderground.syncAerialOverlayStroke(cable); } catch (eSync) {}
        }
    }

    function applyOrgFiberMapStyleToAllCables() {
        syncFiberMapCssVar();
        syncLayMapStylePreview();
        syncThemeFiberMapControls();
        if (global.MapLegendConfig && typeof global.MapLegendConfig.setFiberMapStyle === 'function') {
            try { global.MapLegendConfig.setFiberMapStyle(MAP_FIBER_COLOR, MAP_FIBER_WIDTH); } catch (eLeg) {}
        }
        var list = global.objects;
        if (!Array.isArray(list)) return;
        for (var i = 0; i < list.length; i++) {
            var cable = list[i];
            if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') continue;
            if (!isOpticalCableType(cable.properties.get('cableType'))) continue;
            try {
                if (cable.properties.get('mapColor') != null) cable.properties.unset('mapColor');
                if (cable.properties.get('mapStrokeWidth') != null) cable.properties.unset('mapStrokeWidth');
            } catch (eUnset) {}
            applyOpticalMapStyle(cable);
        }
    }

    /**
     * Org-wide стиль линии ВОЛС. applyAll — сразу ко всем кабелям на карте.
     */
    function setOrgFiberMapStyle(color, width, opts) {
        opts = opts || {};
        if (color !== undefined && color !== null && color !== '') {
            MAP_FIBER_COLOR = normalizeMapColor(color);
        }
        if (width !== undefined && width !== null && width !== '') {
            MAP_FIBER_WIDTH = normalizeMapStrokeWidth(width);
        }
        // Keep exported mirrors in sync for code that reads FiberCableConfig.MAP_FIBER_*
        if (global.FiberCableConfig) {
            global.FiberCableConfig.MAP_FIBER_COLOR = MAP_FIBER_COLOR;
            global.FiberCableConfig.MAP_FIBER_WIDTH = MAP_FIBER_WIDTH;
        }
        syncFiberMapCssVar();
        syncThemeFiberMapControls();
        syncLayMapStylePreview();
        if (opts.applyAll !== false) applyOrgFiberMapStyleToAllCables();
        return { color: MAP_FIBER_COLOR, width: MAP_FIBER_WIDTH };
    }

    function getMapColorFromCable() {
        return MAP_FIBER_COLOR;
    }

    function getMapStrokeWidthFromCable() {
        return MAP_FIBER_WIDTH;
    }

    function getLayMapColor() {
        return MAP_FIBER_COLOR;
    }

    function getLayMapStrokeWidth() {
        return MAP_FIBER_WIDTH;
    }

    function normalizeFibersPerModule(val) {
        if (val == null || val === '' || val === false || val === 0 || val === '0') return 0;
        var n = parseInt(val, 10);
        if (isNaN(n) || n < 2) return 0;
        return Math.min(MAX_FIBERS, n);
    }

    function getFibersPerModuleFromCable(cable) {
        if (!cable || !cable.properties) return 0;
        var explicit = normalizeFibersPerModule(cable.properties.get('fibersPerModule'));
        if (explicit > 0) return explicit;
        if (isModularCableType(cable.properties.get('cableType'))) return DEFAULT_FIBERS_PER_MODULE;
        return 0;
    }

    function isModularCable(cable) {
        if (!cable || !cable.properties) return false;
        if (isModularCableType(cable.properties.get('cableType'))) return true;
        return getFibersPerModuleFromCable(cable) > 0;
    }

    function normalizeModuleCount(val) {
        var n = parseInt(val, 10);
        if (isNaN(n) || n < 1) return 1;
        return Math.min(MAX_FIBERS, n);
    }

    function getModuleCount(fiberCount, fibersPerModule) {
        var n = Math.max(1, parseInt(fiberCount, 10) || 1);
        var m = normalizeFibersPerModule(fibersPerModule);
        if (m <= 0) return 1;
        return Math.ceil(n / m);
    }

    function resolveModularTotals(modules, perModule) {
        var m = normalizeModuleCount(modules);
        var p = normalizeFibersPerModule(perModule) || DEFAULT_FIBERS_PER_MODULE;
        var total = m * p;
        if (total > MAX_FIBERS) {
            m = Math.max(1, Math.floor(MAX_FIBERS / p));
            total = m * p;
        }
        return { modules: m, perModule: p, fiberCount: total };
    }

    function getModuleCountFromCable(cable) {
        if (!cable || !cable.properties) return 0;
        if (!isModularCable(cable)) return 0;
        var explicit = cable.properties.get('moduleCount');
        if (explicit != null && explicit !== '') {
            var n = normalizeModuleCount(explicit);
            if (n > 0) return n;
        }
        var mpm = getFibersPerModuleFromCable(cable);
        var fc = getFiberCountFromCable(cable);
        return getModuleCount(fc, mpm);
    }

    function buildModularConfigPanelHtml(opts) {
        opts = opts || {};
        var idPrefix = opts.idPrefix || 'modCfg';
        var modules = normalizeModuleCount(opts.modules != null ? opts.modules : 2);
        var perModule = normalizeFibersPerModule(opts.perModule) || DEFAULT_FIBERS_PER_MODULE;
        var totals = resolveModularTotals(modules, perModule);
        var html = '<div class="cable-modular-config" id="' + idPrefix + 'Root" data-prefix="' + idPrefix + '">';
        html += '<div class="cable-modular-config__row">';
        html += '<label class="cable-fiber-lay-label" for="' + idPrefix + 'Modules">Модулей</label>';
        html += '<input type="number" id="' + idPrefix + 'Modules" class="form-input cable-modular-count-input" min="1" max="24" value="' + totals.modules + '" aria-label="Число модулей">';
        html += '<label class="cable-fiber-lay-label" for="' + idPrefix + 'PerModule">Жил в модуле</label>';
        html += '<input type="number" id="' + idPrefix + 'PerModule" class="form-input cable-modular-count-input" min="2" max="24" value="' + totals.perModule + '" aria-label="Жил в модуле">';
        html += '<span class="cable-modular-config__total" id="' + idPrefix + 'Total">' + totals.fiberCount + ' жил</span>';
        html += '</div>';
        html += '<div class="cable-modular-presets" role="group" aria-label="Готовые конфигурации модульного кабеля">';
        MODULAR_CABLE_PRESETS.forEach(function(p) {
            var active = p.modules === totals.modules && p.perModule === totals.perModule;
            html += '<button type="button" class="cable-modular-preset' + (active ? ' cable-modular-preset--active' : '') + '" data-modules="' + p.modules + '" data-per-module="' + p.perModule + '" title="' + p.modules + ' модулей × ' + p.perModule + ' жил = ' + (p.modules * p.perModule) + '">' + p.label + ' <em>(' + (p.modules * p.perModule) + ')</em></button>';
        });
        html += '</div>';
        html += '<p class="object-card-hint cable-modular-config__hint">Один кабель на схеме; модули выделяются рамками вокруг групп жил.</p>';
        html += '</div>';
        return html;
    }

    function readModularConfigFromPanel(idPrefix) {
        var modEl = document.getElementById(idPrefix + 'Modules');
        var perEl = document.getElementById(idPrefix + 'PerModule');
        return resolveModularTotals(modEl && modEl.value, perEl && perEl.value);
    }

    function syncModularConfigPanel(idPrefix, modules, perModule) {
        var totals = resolveModularTotals(modules, perModule);
        var modEl = document.getElementById(idPrefix + 'Modules');
        var perEl = document.getElementById(idPrefix + 'PerModule');
        var totEl = document.getElementById(idPrefix + 'Total');
        if (modEl) modEl.value = String(totals.modules);
        if (perEl) perEl.value = String(totals.perModule);
        if (totEl) totEl.textContent = totals.fiberCount + ' жил';
        var root = document.getElementById(idPrefix + 'Root');
        if (root) {
            root.querySelectorAll('.cable-modular-preset').forEach(function(btn) {
                var m = parseInt(btn.getAttribute('data-modules'), 10);
                var p = parseInt(btn.getAttribute('data-per-module'), 10);
                btn.classList.toggle('cable-modular-preset--active', m === totals.modules && p === totals.perModule);
            });
        }
        return totals;
    }

    function bindModularConfigPanel(idPrefix, onChange) {
        var root = document.getElementById(idPrefix + 'Root');
        if (!root || root._modCfgBound) return;
        root._modCfgBound = true;
        function emit() {
            var totals = syncModularConfigPanel(idPrefix,
                (document.getElementById(idPrefix + 'Modules') || {}).value,
                (document.getElementById(idPrefix + 'PerModule') || {}).value
            );
            if (typeof onChange === 'function') onChange(totals);
        }
        var modEl = document.getElementById(idPrefix + 'Modules');
        var perEl = document.getElementById(idPrefix + 'PerModule');
        if (modEl) modEl.addEventListener('change', emit);
        if (perEl) perEl.addEventListener('change', emit);
        root.querySelectorAll('.cable-modular-preset').forEach(function(btn) {
            btn.addEventListener('click', function() {
                syncModularConfigPanel(idPrefix, btn.getAttribute('data-modules'), btn.getAttribute('data-per-module'));
                emit();
            });
        });
    }

    function getFiberModuleIndex(fiberNumber, fibersPerModule) {
        var m = normalizeFibersPerModule(fibersPerModule);
        if (m <= 0) return 0;
        var num = parseInt(fiberNumber, 10) || 1;
        return Math.floor((num - 1) / m);
    }

    function getModuleTubeColor(moduleIndex) {
        return MODULE_TUBE_COLORS[Math.abs(moduleIndex || 0) % MODULE_TUBE_COLORS.length];
    }

    /**
     * Группирует жилы по модулям.
     * @returns {{ moduleIndex:number, moduleNumber:number, color:string, fibers:array }[]}
     */
    function groupFibersByModules(fibers, fibersPerModule) {
        var list = Array.isArray(fibers) ? fibers : [];
        var m = normalizeFibersPerModule(fibersPerModule);
        if (m <= 0 || !list.length) {
            return [{
                moduleIndex: 0,
                moduleNumber: 1,
                color: getModuleTubeColor(0),
                fibers: list.slice()
            }];
        }
        var groups = [];
        for (var i = 0; i < list.length; i++) {
            var fiber = list[i];
            var mi = getFiberModuleIndex(fiber.number != null ? fiber.number : (i + 1), m);
            if (!groups[mi]) {
                groups[mi] = {
                    moduleIndex: mi,
                    moduleNumber: mi + 1,
                    color: getModuleTubeColor(mi),
                    fibers: []
                };
            }
            groups[mi].fibers.push(fiber);
        }
        return groups.filter(Boolean);
    }

    function getLayModularTotalsFromStorage() {
        var modules = 2;
        var perModule = DEFAULT_FIBERS_PER_MODULE;
        try {
            var m = parseInt(localStorage.getItem(LAY_MODULE_COUNT_KEY), 10);
            if (!isNaN(m) && m >= 1) modules = m;
            var p = normalizeFibersPerModule(localStorage.getItem(LAY_FIBERS_PER_MODULE_KEY));
            if (p > 0) perModule = p;
        } catch (e) {}
        return resolveModularTotals(modules, perModule);
    }

    function ensureLayModularConfigPanel() {
        var mount = document.getElementById('layModularConfigMount');
        if (!mount) return null;
        if (!document.getElementById('layModCfgRoot')) {
            var stored = getLayModularTotalsFromStorage();
            mount.innerHTML = buildModularConfigPanelHtml({
                idPrefix: 'layModCfg',
                modules: stored.modules,
                perModule: stored.perModule
            });
            bindModularConfigPanel('layModCfg', function(totals) {
                setLayModularTotals(totals.modules, totals.perModule);
            });
        }
        return document.getElementById('layModCfgRoot');
    }

    function getLayModularTotals() {
        if (getLayCableKind() !== 'fiberModular') {
            return { modules: 0, perModule: 0, fiberCount: getLayFiberCount() };
        }
        if (document.getElementById('layModCfgModules') || document.getElementById('layModCfgPerModule')) {
            return readModularConfigFromPanel('layModCfg');
        }
        return getLayModularTotalsFromStorage();
    }

    function setLayModularTotals(modules, perModule) {
        var totals = resolveModularTotals(modules, perModule);
        try {
            localStorage.setItem(LAY_MODULE_COUNT_KEY, String(totals.modules));
            localStorage.setItem(LAY_FIBERS_PER_MODULE_KEY, String(totals.perModule));
        } catch (e) {}
        ensureLayModularConfigPanel();
        syncModularConfigPanel('layModCfg', totals.modules, totals.perModule);
        setLayFiberCount(totals.fiberCount);
        return totals;
    }

    function getLayFibersPerModule() {
        if (getLayCableKind() !== 'fiberModular') return 0;
        return getLayModularTotals().perModule || DEFAULT_FIBERS_PER_MODULE;
    }

    function setLayFibersPerModule(val) {
        var v = normalizeFibersPerModule(val);
        if (v <= 0) {
            try { localStorage.setItem(LAY_FIBERS_PER_MODULE_KEY, '0'); } catch (e) {}
            return 0;
        }
        var modules = getLayModularTotalsFromStorage().modules;
        setLayModularTotals(modules, v);
        return v;
    }

    function syncLayModularUI() {
        var stored = 0;
        try {
            stored = normalizeFibersPerModule(localStorage.getItem(LAY_FIBERS_PER_MODULE_KEY));
        } catch (e) {}
        var sel = document.getElementById('cableType');
        var kind = (sel && isModularCableType(sel.value)) || stored > 0 ? 'fiberModular' : 'fiber';
        if (sel && !sel.value) sel.value = kind;
        setLayCableKind(kind === 'fiberModular' ? 'fiberModular' : 'fiber');
    }

    function applyCableFiberSettings(cable, fiberCount, fiberPalette, fibersPerModule, moduleCount) {
        if (!cable || !cable.properties) return;
        var count = Math.max(1, Math.min(MAX_FIBERS, parseInt(fiberCount, 10) || 1));
        cable.properties.set('fiberCount', count);
        var curType = cable.properties.get('cableType');
        if (!isOpticalCableType(curType)) {
            cable.properties.set('cableType', 'fiber');
            curType = 'fiber';
        }
        if (fiberPalette === null) {
            cable.properties.unset('fiberPalette');
        } else if (Array.isArray(fiberPalette) && fiberPalette.length) {
            cable.properties.set('fiberPalette', trimPaletteToCount(fiberPalette, count));
        } else {
            var existing = cable.properties.get('fiberPalette');
            if (Array.isArray(existing) && existing.length) {
                cable.properties.set('fiberPalette', trimPaletteToCount(existing, count));
            }
        }
        if (fibersPerModule !== undefined) {
            var mpm = normalizeFibersPerModule(fibersPerModule);
            if (mpm > 0) {
                cable.properties.set('fibersPerModule', mpm);
                cable.properties.set('cableType', 'fiberModular');
                var modCount = moduleCount != null
                    ? normalizeModuleCount(moduleCount)
                    : getModuleCount(count, mpm);
                cable.properties.set('moduleCount', modCount);
            } else {
                cable.properties.unset('fibersPerModule');
                cable.properties.unset('moduleCount');
                if (isModularCableType(curType) || isModularCableType(cable.properties.get('cableType'))) {
                    cable.properties.set('cableType', 'fiber');
                }
            }
        } else if (isModularCableType(cable.properties.get('cableType'))) {
            var existingMpm = normalizeFibersPerModule(cable.properties.get('fibersPerModule'));
            if (existingMpm <= 0) cable.properties.set('fibersPerModule', DEFAULT_FIBERS_PER_MODULE);
            if (!(cable.properties.get('moduleCount') > 0)) {
                cable.properties.set('moduleCount', getModuleCount(count, getFibersPerModuleFromCable(cable)));
            }
        }
        applyOpticalMapStyle(cable);
    }

    function applyModularCableSettings(cable, modules, perModule, fiberPalette) {
        var totals = resolveModularTotals(modules, perModule);
        applyCableFiberSettings(cable, totals.fiberCount, fiberPalette, totals.perModule, totals.modules);
        return totals;
    }

    function getLayCableKind() {
        var sel = document.getElementById('cableType');
        if (sel && isModularCableType(sel.value)) return 'fiberModular';
        if (sel && sel.value === 'fiber') return 'fiber';
        try {
            if (normalizeFibersPerModule(localStorage.getItem(LAY_FIBERS_PER_MODULE_KEY)) > 0) {
                return 'fiberModular';
            }
        } catch (e) {}
        return 'fiber';
    }

    function setLayCableKind(kind) {
        var modular = isModularCableType(kind);
        var sel = document.getElementById('cableType');
        if (sel) sel.value = modular ? 'fiberModular' : 'fiber';
        document.querySelectorAll('.cable-kind-preset').forEach(function(btn) {
            btn.classList.toggle('cable-kind-preset--active',
                btn.getAttribute('data-kind') === (modular ? 'fiberModular' : 'fiber'));
        });
        var wrap = document.getElementById('layModuleSizeWrap');
        if (wrap) wrap.style.display = modular ? '' : 'none';
        if (modular) {
            ensureLayModularConfigPanel();
            var totals = getLayModularTotalsFromStorage();
            setLayModularTotals(totals.modules, totals.perModule);
        }
        return modular ? 'fiberModular' : 'fiber';
    }

    var _paletteEditorState = { working: [], onSave: null };

    function closePaletteModal() {
        var modal = document.getElementById('fiberPaletteModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('fiber-palette-modal-open');
        _paletteEditorState.onSave = null;
        _paletteEditorState.working = [];
    }

    function syncLayPaletteButtonState() {
        var btn = document.getElementById('layFiberPaletteBtn');
        if (btn) {
            var pal = getLayFiberPalette();
            btn.classList.toggle('cable-fiber-palette-btn--custom', !!(pal && pal.length));
        }
    }

    function openLayCablePaletteEditor(options) {
        options = options || {};
        var c = getLayFiberCount();
        openFiberPaletteEditor({
            title: options.title || 'Цвета жил для прокладки',
            fiberCount: c,
            palette: getLayFiberPalette() || buildStandardPalette(c),
            onSave: function(r) {
                setLayFiberCount(r.fiberCount);
                setLayFiberPalette(r.palette);
                syncLayPaletteButtonState();
                if (typeof options.onSave === 'function') options.onSave(r);
            }
        });
    }

    function ensureFiberPaletteModalBound() {
        var modal = document.getElementById('fiberPaletteModal');
        if (!modal || modal._fiberPaletteBound) return;
        modal._fiberPaletteBound = true;

        modal.addEventListener('click', function(e) {
            if (e.target === modal) closePaletteModal();
        });
        var content = modal.querySelector('.fiber-palette-modal-content');
        if (content) {
            content.addEventListener('click', function(e) { e.stopPropagation(); });
        }

        var closeBtn = modal.querySelector('.close-fiber-palette');
        if (closeBtn) closeBtn.addEventListener('click', closePaletteModal);

        var cancelBtn = document.getElementById('fiberPaletteCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', closePaletteModal);

        var countInput = document.getElementById('fiberPaletteCountInput');
        if (countInput) countInput.addEventListener('change', function() {
            var working = _paletteEditorState.working;
            var n = Math.max(1, Math.min(MAX_FIBERS, parseInt(countInput.value, 10) || 1));
            countInput.value = String(n);
            while (working.length < n) {
                var i = working.length;
                var b = BASE_COLORS[i % 12];
                var r = i >= 12;
                working.push({
                    number: i + 1,
                    name: r ? b.name + ' (с черн. кольцом)' : b.name,
                    color: b.color,
                    hasBlackRing: r
                });
            }
            if (working.length > n) working.length = n;
            renderFiberPaletteList();
        });

        var stdBtn = document.getElementById('fiberPaletteStdBtn');
        if (stdBtn) stdBtn.addEventListener('click', function() {
            var countInputEl = document.getElementById('fiberPaletteCountInput');
            var n = parseInt(countInputEl && countInputEl.value, 10) || _paletteEditorState.working.length;
            _paletteEditorState.working = buildStandardPalette(n);
            renderFiberPaletteList();
        });

        var addBtn = document.getElementById('fiberPaletteAddBtn');
        if (addBtn) addBtn.addEventListener('click', function() {
            var working = _paletteEditorState.working;
            if (working.length >= MAX_FIBERS) return;
            working.push({
                number: working.length + 1,
                name: 'Жила ' + (working.length + 1),
                color: '#94a3b8',
                hasBlackRing: false
            });
            var countInputEl = document.getElementById('fiberPaletteCountInput');
            if (countInputEl) countInputEl.value = String(working.length);
            renderFiberPaletteList();
        });

        var saveBtn = document.getElementById('fiberPaletteSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', function() {
            var working = _paletteEditorState.working;
            working.forEach(function(f, idx) { f.number = idx + 1; });
            var finalCount = working.length;
            var std = buildStandardPalette(finalCount);
            var isStd = working.length === std.length && working.every(function(f, i) {
                return f.color === std[i].color && f.name === std[i].name && !!f.hasBlackRing === !!std[i].hasBlackRing;
            });
            var onSave = _paletteEditorState.onSave;
            closePaletteModal();
            if (typeof onSave === 'function') {
                onSave({ fiberCount: finalCount, palette: isStd ? null : working.slice() });
            }
        });
    }

    function renderFiberPaletteList() {
        var list = document.getElementById('fiberPaletteList');
        var working = _paletteEditorState.working;
        if (!list || !working) return;
        working.forEach(function(f, idx) { f.number = idx + 1; });
        list.innerHTML = working.map(function(f, idx) {
            return '<div class="fiber-palette-row" data-idx="' + idx + '">' +
                '<span class="fiber-palette-row__num">' + f.number + '</span>' +
                '<input type="color" class="fiber-palette-row__color" value="' + esc(f.color) + '" title="Цвет">' +
                '<input type="text" class="form-input fiber-palette-row__name" value="' + esc(f.name) + '" placeholder="Название">' +
                '<label class="fiber-palette-row__ring"><input type="checkbox" class="fiber-palette-row__ring-cb"' +
                (f.hasBlackRing ? ' checked' : '') + '> кольцо</label>' +
                '<button type="button" class="fiber-palette-row__remove btn-delete-cable" title="Удалить" aria-label="Удалить жилу">&times;</button></div>';
        }).join('');
        list.querySelectorAll('.fiber-palette-row__color').forEach(function(inp) {
            inp.addEventListener('input', function() {
                working[parseInt(inp.closest('.fiber-palette-row').getAttribute('data-idx'), 10)].color = inp.value;
            });
        });
        list.querySelectorAll('.fiber-palette-row__name').forEach(function(inp) {
            inp.addEventListener('input', function() {
                working[parseInt(inp.closest('.fiber-palette-row').getAttribute('data-idx'), 10)].name = inp.value;
            });
        });
        list.querySelectorAll('.fiber-palette-row__ring-cb').forEach(function(cb) {
            cb.addEventListener('change', function() {
                working[parseInt(cb.closest('.fiber-palette-row').getAttribute('data-idx'), 10)].hasBlackRing = cb.checked;
            });
        });
        list.querySelectorAll('.fiber-palette-row__remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var i = parseInt(btn.closest('.fiber-palette-row').getAttribute('data-idx'), 10);
                if (working.length <= 1) return;
                working.splice(i, 1);
                var countInputEl = document.getElementById('fiberPaletteCountInput');
                if (countInputEl) countInputEl.value = String(working.length);
                renderFiberPaletteList();
            });
        });
    }

    function openFiberPaletteEditor(options) {
        options = options || {};
        var modal = document.getElementById('fiberPaletteModal');
        if (!modal) return;

        ensureFiberPaletteModalBound();

        var count = Math.max(1, Math.min(MAX_FIBERS, parseInt(options.fiberCount, 10) || 4));
        var working = normalizePalette(
            options.palette && options.palette.length ? options.palette : buildStandardPalette(count)
        );
        while (working.length < count) {
            var i = working.length;
            var b = BASE_COLORS[i % 12];
            var r = i >= 12;
            working.push({
                number: i + 1,
                name: r ? b.name + ' (с черн. кольцом)' : b.name,
                color: b.color,
                hasBlackRing: r
            });
        }
        if (working.length > count) working = working.slice(0, count);

        _paletteEditorState.working = working;
        _paletteEditorState.onSave = options.onSave || null;

        var titleEl = document.getElementById('fiberPaletteModalTitle');
        if (titleEl) titleEl.textContent = options.title || 'Цвета жил кабеля';

        var countInput = document.getElementById('fiberPaletteCountInput');
        if (countInput) {
            countInput.max = String(MAX_FIBERS);
            countInput.value = String(working.length);
        }

        renderFiberPaletteList();

        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('fiber-palette-modal-open');

        if (typeof global.initPanelPlexusCanvases === 'function') {
            requestAnimationFrame(function() { global.initPanelPlexusCanvases(modal); });
        }
    }

    var CABLE_PALETTE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureFiberPaletteModalBound);
    } else {
        ensureFiberPaletteModalBound();
    }

    function setupLayFiberControls() {
        var countInput = document.getElementById('layFiberCount');
        if (countInput) {
            try {
                var stored = localStorage.getItem(LAY_FIBER_COUNT_KEY);
                if (stored) countInput.value = stored;
            } catch (e) {}
            countInput.addEventListener('change', function() { setLayFiberCount(countInput.value); });
        }
        document.querySelectorAll('.cable-fiber-preset').forEach(function(btn) {
            if (btn.classList.contains('cable-module-size-preset')) return;
            btn.addEventListener('click', function() { setLayFiberCount(btn.getAttribute('data-count')); });
        });
        function bindLayPaletteBtn(btn) {
            if (!btn || btn._bound) return;
            btn._bound = true;
            btn.addEventListener('click', function(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                openLayCablePaletteEditor();
            });
        }
        bindLayPaletteBtn(document.getElementById('layFiberPaletteBtn'));

        document.querySelectorAll('.cable-kind-preset').forEach(function(btn) {
            if (btn._kindBound) return;
            btn._kindBound = true;
            btn.addEventListener('click', function() {
                setLayCableKind(btn.getAttribute('data-kind') || 'fiber');
            });
        });
        var modularToggle = document.getElementById('layModularCable');
        if (modularToggle && !modularToggle._modBound) {
            modularToggle._modBound = true;
            modularToggle.addEventListener('change', function() {
                setLayCableKind(modularToggle.checked ? 'fiberModular' : 'fiber');
            });
        }

        syncLayFiberPresetsUI();
        syncLayPaletteButtonState();
        syncLayModularUI();
        syncLayMapStylePreview();
    }

    function renderCableLayPanel() {
        var picker = document.getElementById('cableTypePicker');
        if (!picker) return;
        picker.innerHTML =
            '<div class="cable-lay-fiber-visual" aria-hidden="true">' +
            '<span class="cable-lay-fiber-line"></span>' +
            '<span class="cable-lay-fiber-label">На карте — одна линия</span></div>';
        syncLayMapStylePreview();
    }

    function cablePaletteButtonHtml() {
        return CABLE_PALETTE_ICON_SVG + ' <span>Цвета</span>';
    }

    function getCableMapColor(arg) {
        if (arg && arg.properties && arg.properties.get('type') === 'cable') {
            var ct = arg.properties.get('cableType');
            if (ct === 'copper') return '#b45309';
            if (isOpticalCableType(ct)) return getMapColorFromCable(arg);
            return '#64748b';
        }
        if (isOpticalCableType(arg)) return MAP_FIBER_COLOR;
        if (arg === 'copper') return '#b45309';
        return '#64748b';
    }

    function getCableMapWidth(arg) {
        if (arg && arg.properties && arg.properties.get('type') === 'cable') {
            var ct = arg.properties.get('cableType');
            if (ct === 'copper') return 3;
            if (isOpticalCableType(ct)) return getMapStrokeWidthFromCable(arg);
            return 2;
        }
        if (isOpticalCableType(arg)) return MAP_FIBER_WIDTH;
        if (arg === 'copper') return 3;
        return 2;
    }

    global.FiberCableConfig = {
        MAP_FIBER_COLOR: MAP_FIBER_COLOR,
        MAP_FIBER_WIDTH: MAP_FIBER_WIDTH,
        MIN_MAP_STROKE_WIDTH: MIN_MAP_STROKE_WIDTH,
        MAX_MAP_STROKE_WIDTH: MAX_MAP_STROKE_WIDTH,
        MAX_FIBERS: MAX_FIBERS,
        DEFAULT_FIBERS_PER_MODULE: DEFAULT_FIBERS_PER_MODULE,
        MODULE_SIZE_PRESETS: MODULE_SIZE_PRESETS,
        MODULAR_CABLE_PRESETS: MODULAR_CABLE_PRESETS,
        LEGACY_TYPE_COUNTS: LEGACY_TYPE_COUNTS,
        isOpticalCableType: isOpticalCableType,
        isModularCableType: isModularCableType,
        buildStandardPalette: buildStandardPalette,
        getFiberCount: getFiberCount,
        getFiberCountFromCable: getFiberCountFromCable,
        getFiberCountFromType: getFiberCountFromType,
        getFiberColors: getFiberColors,
        getFiberPaletteForCable: getFiberPaletteForCable,
        trimPaletteToCount: trimPaletteToCount,
        normalizeFibersPerModule: normalizeFibersPerModule,
        normalizeModuleCount: normalizeModuleCount,
        normalizeMapColor: normalizeMapColor,
        normalizeMapStrokeWidth: normalizeMapStrokeWidth,
        resolveModularTotals: resolveModularTotals,
        getFibersPerModuleFromCable: getFibersPerModuleFromCable,
        getModuleCountFromCable: getModuleCountFromCable,
        isModularCable: isModularCable,
        getModuleCount: getModuleCount,
        getFiberModuleIndex: getFiberModuleIndex,
        getModuleTubeColor: getModuleTubeColor,
        groupFibersByModules: groupFibersByModules,
        buildModularConfigPanelHtml: buildModularConfigPanelHtml,
        readModularConfigFromPanel: readModularConfigFromPanel,
        syncModularConfigPanel: syncModularConfigPanel,
        bindModularConfigPanel: bindModularConfigPanel,
        getLayFibersPerModule: getLayFibersPerModule,
        setLayFibersPerModule: setLayFibersPerModule,
        getLayModularTotals: getLayModularTotals,
        setLayModularTotals: setLayModularTotals,
        ensureLayModularConfigPanel: ensureLayModularConfigPanel,
        getLayCableKind: getLayCableKind,
        setLayCableKind: setLayCableKind,
        syncLayModularUI: syncLayModularUI,
        applyModularCableSettings: applyModularCableSettings,
        getCableMapColor: getCableMapColor,
        getCableMapWidth: getCableMapWidth,
        getMapColorFromCable: getMapColorFromCable,
        getMapStrokeWidthFromCable: getMapStrokeWidthFromCable,
        getCableLabel: getCableLabel,
        getLayFiberCount: getLayFiberCount,
        setLayFiberCount: setLayFiberCount,
        getLayFiberPalette: getLayFiberPalette,
        setLayFiberPalette: setLayFiberPalette,
        getLayMapColor: getLayMapColor,
        getLayMapStrokeWidth: getLayMapStrokeWidth,
        getOrgFiberMapColor: getOrgFiberMapColor,
        getOrgFiberMapStrokeWidth: getOrgFiberMapStrokeWidth,
        setOrgFiberMapStyle: setOrgFiberMapStyle,
        applyOrgFiberMapStyleToAllCables: applyOrgFiberMapStyleToAllCables,
        syncLayMapStylePreview: syncLayMapStylePreview,
        syncThemeFiberMapControls: syncThemeFiberMapControls,
        applyOpticalMapStyle: applyOpticalMapStyle,
        applyCableFiberSettings: applyCableFiberSettings,
        openFiberPaletteEditor: openFiberPaletteEditor,
        openLayCablePaletteEditor: openLayCablePaletteEditor,
        syncLayPaletteButtonState: syncLayPaletteButtonState,
        setupLayFiberControls: setupLayFiberControls,
        renderCableLayPanel: renderCableLayPanel,
        syncLayFiberPresetsUI: syncLayFiberPresetsUI,
        cablePaletteButtonHtml: cablePaletteButtonHtml
    };
})(typeof window !== 'undefined' ? window : this);
