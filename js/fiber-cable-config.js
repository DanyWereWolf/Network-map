/** ВОЛС: единый вид на карте, настраиваемые жилы. */
(function(global) {
    var MAP_FIBER_COLOR = '#00AA00';
    var MAP_FIBER_WIDTH = 3;
    var MAX_FIBERS = 96;
    var LAY_FIBER_COUNT_KEY = 'networkMap_layFiberCount';
    var LAY_FIBER_PALETTE_KEY = 'networkMap_layFiberPalette';
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
        return type && type !== 'copper' && (type === 'fiber' || !!LEGACY_TYPE_COUNTS[type]);
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
        return countFromLegacyType(cable.properties.get('cableType')) || 0;
    }

    function getFiberCountFromType(type) {
        if (type === 'fiber') return getLayFiberCount();
        return countFromLegacyType(type) || 0;
    }

    function getFiberCount(arg) {
        if (arg && arg.properties && arg.properties.get('type') === 'cable') {
            return getFiberCountFromCable(arg);
        }
        return getFiberCountFromType(arg);
    }

    function getFiberPaletteForCable(cable) {
        if (!cable || !cable.properties) return [];
        var custom = cable.properties.get('fiberPalette');
        if (Array.isArray(custom) && custom.length) return normalizePalette(custom);
        var c = getFiberCountFromCable(cable);
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
        return count > 0 ? 'ВОЛС, ' + count + ' ' + pluralFibers(count) : 'ВОЛС';
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
        return v;
    }

    function syncLayFiberPresetsUI() {
        var count = getLayFiberCount();
        document.querySelectorAll('.cable-fiber-preset').forEach(function(btn) {
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
            else localStorage.setItem(LAY_FIBER_PALETTE_KEY, JSON.stringify(normalizePalette(palette)));
        } catch (e) {}
    }

    function applyOpticalMapStyle(cable) {
        if (!cable || !cable.options) return;
        if (!isOpticalCableType(cable.properties.get('cableType'))) return;
        cable.options.set({ strokeColor: MAP_FIBER_COLOR, strokeWidth: MAP_FIBER_WIDTH, strokeOpacity: 0.8 });
    }

    function applyCableFiberSettings(cable, fiberCount, fiberPalette) {
        if (!cable || !cable.properties) return;
        var count = Math.max(1, Math.min(MAX_FIBERS, parseInt(fiberCount, 10) || 1));
        cable.properties.set('fiberCount', count);
        if (!isOpticalCableType(cable.properties.get('cableType'))) {
            cable.properties.set('cableType', 'fiber');
        }
        if (fiberPalette === null) {
            cable.properties.set('fiberPalette', null);
        } else if (Array.isArray(fiberPalette) && fiberPalette.length) {
            cable.properties.set('fiberPalette', normalizePalette(fiberPalette));
        } else {
            cable.properties.unset('fiberPalette');
        }
        applyOpticalMapStyle(cable);
    }

    var _paletteEditorState = { working: [], onSave: null };

    function closePaletteModal() {
        var modal = document.getElementById('fiberPaletteModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        _paletteEditorState.onSave = null;
        _paletteEditorState.working = [];
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
            btn.addEventListener('click', function() { setLayFiberCount(btn.getAttribute('data-count')); });
        });
        var palBtn = document.getElementById('layFiberPaletteBtn');
        if (palBtn && !palBtn._bound) {
            palBtn._bound = true;
            palBtn.addEventListener('click', function() {
                var c = getLayFiberCount();
                openFiberPaletteEditor({
                    title: 'Цвета жил для новых кабелей',
                    fiberCount: c,
                    palette: getLayFiberPalette() || buildStandardPalette(c),
                    onSave: function(r) {
                        setLayFiberCount(r.fiberCount);
                        setLayFiberPalette(r.palette);
                    }
                });
            });
        }
        syncLayFiberPresetsUI();
    }

    function renderCableLayPanel() {
        var picker = document.getElementById('cableTypePicker');
        if (!picker) return;
        picker.innerHTML =
            '<div class="cable-lay-fiber-visual" aria-hidden="true">' +
            '<span class="cable-lay-fiber-line"></span>' +
            '<span class="cable-lay-fiber-label">На карте — одна линия</span></div>';
    }

    function cablePaletteButtonHtml() {
        return CABLE_PALETTE_ICON_SVG + ' <span>Цвета</span>';
    }

    global.FiberCableConfig = {
        MAP_FIBER_COLOR: MAP_FIBER_COLOR,
        MAP_FIBER_WIDTH: MAP_FIBER_WIDTH,
        MAX_FIBERS: MAX_FIBERS,
        LEGACY_TYPE_COUNTS: LEGACY_TYPE_COUNTS,
        isOpticalCableType: isOpticalCableType,
        buildStandardPalette: buildStandardPalette,
        getFiberCount: getFiberCount,
        getFiberCountFromCable: getFiberCountFromCable,
        getFiberCountFromType: getFiberCountFromType,
        getFiberColors: getFiberColors,
        getFiberPaletteForCable: getFiberPaletteForCable,
        getCableMapColor: function(t) {
            return isOpticalCableType(t) ? MAP_FIBER_COLOR : (t === 'copper' ? '#b45309' : '#64748b');
        },
        getCableMapWidth: function(t) {
            return isOpticalCableType(t) ? MAP_FIBER_WIDTH : (t === 'copper' ? 3 : 2);
        },
        getCableLabel: getCableLabel,
        getLayFiberCount: getLayFiberCount,
        setLayFiberCount: setLayFiberCount,
        getLayFiberPalette: getLayFiberPalette,
        setLayFiberPalette: setLayFiberPalette,
        applyOpticalMapStyle: applyOpticalMapStyle,
        applyCableFiberSettings: applyCableFiberSettings,
        openFiberPaletteEditor: openFiberPaletteEditor,
        setupLayFiberControls: setupLayFiberControls,
        renderCableLayPanel: renderCableLayPanel,
        syncLayFiberPresetsUI: syncLayFiberPresetsUI,
        cablePaletteButtonHtml: cablePaletteButtonHtml
    };
})(typeof window !== 'undefined' ? window : this);
