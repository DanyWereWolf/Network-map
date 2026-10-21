/**
 * SVG-иконки объектов на карте.
 * Стиль: soft glass-badge + белый глиф, единая сетка 32×32.
 */
(function (global) {
    var COLORS = {
        support: '#4b8af0',
        sleeve: '#e2556f',
        spliceCassette: '#e0a23a',
        cross: '#8f75e8',
        node: '#2fbf66',
        nodeAggregation: '#e85d5d',
        attachment: '#6b7c93',
        manhole: '#8b5e3c',
        signalPost: '#e0a23a',
        olt: '#2ea8d8',
        splitter: '#9b6fd4',
        onu: '#2aabb8',
        camera: '#5b6b7c',
        mediaConverter: '#2fafa0',
        radioBridge: '#2aabb8',
        switch: '#e8893a',
        cabinet: '#7a736c',
        default: '#94a3b8'
    };

    var GLYPH = '#ffffff';
    var STROKE_SELECTED = '#fde68a';
    var STROKE_HOVER_LIGHT = '#64748b';
    var STROKE_HOVER_DARK = '#93c5fd';
    var uid = 0;

    function nextId(prefix) {
        uid += 1;
        return 'mi-' + (prefix || 'g') + '-' + uid;
    }

    function getMapTheme() {
        if (typeof document !== 'undefined' && document.documentElement) {
            var t = document.documentElement.getAttribute('data-theme');
            if (t === 'dark' || t === 'light') return t;
        }
        return 'light';
    }

    function isDarkMapTheme() {
        return getMapTheme() === 'dark';
    }

    function getOutlineStroke(variant) {
        var dark = isDarkMapTheme();
        if (variant === 'hover') return dark ? '#e0f2fe' : '#0f172a';
        if (variant === 'selected') return dark ? '#fff7ed' : '#0f172a';
        return dark ? '#f8fafc' : '#0f172a';
    }

    function fillOpacity(variant) {
        if (variant === 'phantom') return 0.5;
        if (variant === 'selected') return 1;
        if (variant === 'hover') return 0.98;
        return 0.97;
    }

    function strokeWidth(variant) {
        if (variant === 'selected') return isDarkMapTheme() ? 2.05 : 2.25;
        if (variant === 'hover') return isDarkMapTheme() ? 1.85 : 2.05;
        return isDarkMapTheme() ? 1.65 : 1.9;
    }

    function glyphOpacity(variant) {
        if (variant === 'phantom') return 0.7;
        if (variant === 'selected') return 1;
        return 0.97;
    }

    function getNodeColor(nodeKind) {
        return nodeKind === 'aggregation' ? COLORS.nodeAggregation : COLORS.node;
    }

    function getColor(type, nodeKind) {
        if (type === 'node') return getNodeColor(nodeKind);
        return COLORS[type] || COLORS.default;
    }

    function selectionRing(variant, fill) {
        if (variant === 'selected') {
            return '<circle cx="16" cy="16" r="15.55" fill="none" stroke="' + (fill || STROKE_SELECTED) + '" stroke-width="3" opacity="0.26"/>' +
                '<circle cx="16" cy="16" r="14.5" fill="none" stroke="' + STROKE_SELECTED + '" stroke-width="2.1" opacity="0.98"/>';
        }
        if (variant === 'hover') {
            var hoverStroke = isDarkMapTheme() ? STROKE_HOVER_DARK : STROKE_HOVER_LIGHT;
            return '<circle cx="16" cy="16" r="15.1" fill="none" stroke="' + hoverStroke + '" stroke-width="1.7" opacity="0.5"/>';
        }
        return '';
    }

    /** Градиенты стеклянного бейджа: блик сверху + лёгкое затемнение снизу. */
    function glassDefs(id) {
        var sheen = id + '-s';
        var shade = id + '-d';
        return '<defs>' +
            '<linearGradient id="' + sheen + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>' +
            '<stop offset="42%" stop-color="#ffffff" stop-opacity="0.08"/>' +
            '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>' +
            '</linearGradient>' +
            '<linearGradient id="' + shade + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#000000" stop-opacity="0"/>' +
            '<stop offset="70%" stop-color="#000000" stop-opacity="0"/>' +
            '<stop offset="100%" stop-color="#000000" stop-opacity="0.14"/>' +
            '</linearGradient>' +
            '</defs>';
    }

    function paintShape(shapeOpenTag, fill, sw, w, fo, id) {
        // Заливка → блик → тень → обводка сверху (чтобы stroke не перекрывался).
        var filled = shapeOpenTag + ' fill="' + fill + '" stroke="none" opacity="' + fo + '"/>';
        var sheenLayer = shapeOpenTag + ' fill="url(#' + id + '-s)" stroke="none"/>';
        var shadeLayer = shapeOpenTag + ' fill="url(#' + id + '-d)" stroke="none"/>';
        var outline = shapeOpenTag + ' fill="none" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>';
        return filled + sheenLayer + shadeLayer + outline;
    }

    function paintPath(d, fill, sw, w, fo, id, join) {
        var j = join ? ' stroke-linejoin="' + join + '"' : '';
        var open = '<path d="' + d + '"' + j;
        return paintShape(open, fill, sw, w, fo, id);
    }

    function paintRect(x, y, width, height, rx, fill, sw, w, fo, id) {
        var open = '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="' + rx + '"';
        return paintShape(open, fill, sw, w, fo, id);
    }

    function paintCircle(cx, cy, r, fill, sw, w, fo, id) {
        var open = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"';
        return paintShape(open, fill, sw, w, fo, id);
    }

    function paintEllipse(cx, cy, rx, ry, fill, sw, w, fo, id) {
        var open = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"';
        return paintShape(open, fill, sw, w, fo, id);
    }

    /** Внутренний стеклянный кант. */
    function insetRimRect(x, y, width, height, rx, go) {
        return '<rect x="' + (x + 1.15) + '" y="' + (y + 1.15) + '" width="' + (width - 2.3) + '" height="' + (height - 2.3) +
            '" rx="' + Math.max(0.5, rx - 1) + '" fill="none" stroke="' + GLYPH + '" stroke-width="0.9" opacity="' + (go * 0.22) + '"/>';
    }

    function insetRimCircle(cx, cy, r, go) {
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r - 1.2) + '" fill="none" stroke="' + GLYPH + '" stroke-width="0.9" opacity="' + (go * 0.22) + '"/>';
    }

    /** Опора — тонкий столб, аккуратная траверса. */
    function drawSupport(fill, sw, w, fo, go) {
        var id = nextId('sup');
        return glassDefs(id) +
            paintRect(14.05, 3.2, 3.9, 24.8, 1.95, fill, sw, w, fo, id) +
            '<path d="M8.2 10.8 H23.8" stroke="' + GLYPH + '" stroke-width="1.85" stroke-linecap="round" opacity="' + go + '"/>' +
            '<path d="M9.6 10.8 V13.8 M22.4 10.8 V13.8" stroke="' + GLYPH + '" stroke-width="1.35" stroke-linecap="round" opacity="' + go + '"/>' +
            '<circle cx="16" cy="18.6" r="1.15" fill="' + GLYPH + '" opacity="' + (go * 0.9) + '"/>' +
            '<ellipse cx="16" cy="28.35" rx="2.6" ry="0.85" fill="' + sw + '" opacity="' + (go * 0.28) + '"/>';
    }

    /** Муфта. */
    function drawSleeve(fill, sw, w, fo, go) {
        var id = nextId('sl');
        var d = 'M16 3.2 L25.8 8.7 V19.5 L16 25 L6.2 19.5 V8.7 Z';
        return glassDefs(id) +
            paintPath(d, fill, sw, w, fo, id, 'round') +
            '<path d="M9.8 14.2 H22.2" stroke="' + GLYPH + '" stroke-width="1.7" stroke-linecap="round" opacity="' + go + '"/>' +
            '<circle cx="16" cy="14.2" r="3.35" fill="none" stroke="' + GLYPH + '" stroke-width="1.55" opacity="' + go + '"/>' +
            '<circle cx="16" cy="14.2" r="1.2" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    /** Кассета. */
    function drawSpliceCassette(fill, sw, w, fo, go) {
        var id = nextId('cs');
        return glassDefs(id) +
            paintRect(4.2, 6.5, 23.6, 19, 5.4, fill, sw, w, fo, id) +
            insetRimRect(4.2, 6.5, 23.6, 19, 5.4, go) +
            '<path d="M8.4 12.4 H23.6 M8.4 16.2 H23.6 M8.4 20 H23.6" stroke="' + GLYPH + '" stroke-width="1.55" stroke-linecap="round" opacity="' + go + '"/>' +
            '<circle cx="10.5" cy="12.4" r="1.05" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="10.5" cy="16.2" r="1.05" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="10.5" cy="20" r="1.05" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    /** Кросс. */
    function drawCross(fill, sw, w, fo, go) {
        var id = nextId('cr');
        var ports = '';
        var xs = [10.4, 16, 21.6];
        var ys = [11.6, 16.1, 20.6];
        for (var i = 0; i < xs.length; i++) {
            for (var j = 0; j < ys.length; j++) {
                ports += '<circle cx="' + xs[i] + '" cy="' + ys[j] + '" r="1.45" fill="' + GLYPH + '" opacity="' + go + '"/>';
            }
        }
        return glassDefs(id) +
            paintRect(4.2, 5, 23.6, 22, 5.6, fill, sw, w, fo, id) +
            insetRimRect(4.2, 5, 23.6, 22, 5.6, go) +
            '<path d="M10.4 6.4 V25.6 M16 6.4 V25.6 M21.6 6.4 V25.6" stroke="' + GLYPH + '" stroke-width="0.85" opacity="' + (go * 0.28) + '"/>' +
            ports;
    }

    /** Узел / агрегация. */
    function drawNode(fill, sw, w, fo, go, nodeKind) {
        var id = nextId('nd');
        if (nodeKind === 'aggregation') {
            var d = 'M16 3 L28.6 16 L16 29 L3.4 16 Z';
            return glassDefs(id) +
                paintPath(d, fill, sw, w, fo, id, 'round') +
                '<circle cx="16" cy="16" r="4.8" fill="none" stroke="' + GLYPH + '" stroke-width="1.7" opacity="' + go + '"/>' +
                '<circle cx="16" cy="16" r="1.95" fill="' + GLYPH + '" opacity="' + go + '"/>';
        }
        return glassDefs(id) +
            paintRect(4.4, 4.4, 23.2, 23.2, 7.4, fill, sw, w, fo, id) +
            insetRimRect(4.4, 4.4, 23.2, 23.2, 7.4, go) +
            '<circle cx="16" cy="16" r="5.1" fill="none" stroke="' + GLYPH + '" stroke-width="1.75" opacity="' + go + '"/>' +
            '<circle cx="16" cy="16" r="2.1" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="9.6" cy="9.6" r="1.3" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="22.4" cy="9.6" r="1.3" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="9.6" cy="22.4" r="1.3" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="22.4" cy="22.4" r="1.3" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    /** Подвес. */
    function drawAttachment(fill, sw, w, fo, go) {
        var id = nextId('at');
        return glassDefs(id) +
            paintCircle(16, 16, 11.1, fill, sw, w, fo, id) +
            insetRimCircle(16, 16, 11.1, go) +
            '<path d="M12.1 13 C12.1 9.7 19.9 9.7 19.9 13 C19.9 16.2 16 17.8 16 21.6" fill="none" stroke="' + GLYPH + '" stroke-width="1.85" stroke-linecap="round" opacity="' + go + '"/>' +
            '<circle cx="16" cy="23.3" r="1.4" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    /** Колодец. */
    function drawManhole(fill, sw, w, fo, go) {
        var id = nextId('mh');
        return glassDefs(id) +
            paintEllipse(16, 17.3, 10.8, 7.5, fill, sw, w, fo, id) +
            '<rect x="10.4" y="7.4" width="11.2" height="3.1" rx="1.5" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<path d="M11.4 17.3 H20.6 M16 11.8 V22.8" stroke="' + GLYPH + '" stroke-width="1.45" stroke-linecap="round" opacity="' + go + '"/>';
    }

    /** Шкаф. */
    function drawCabinet(fill, sw, w, fo, go) {
        var id = nextId('cb');
        return glassDefs(id) +
            paintRect(4.8, 5.6, 22.4, 21, 4.8, fill, sw, w, fo, id) +
            insetRimRect(4.8, 5.6, 22.4, 21, 4.8, go) +
            '<rect x="7.6" y="8.6" width="16.8" height="3.6" rx="1.2" fill="' + GLYPH + '" opacity="' + (go * 0.28) + '"/>' +
            '<path d="M9.2 16.2 H22.8 M9.2 20.4 H22.8" stroke="' + GLYPH + '" stroke-width="1.5" stroke-linecap="round" opacity="' + go + '"/>' +
            '<rect x="20.2" y="18.8" width="3" height="4.8" rx="0.85" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    /** Сигнальный столбик. */
    function drawSignalPost(fill, sw, w, fo, go) {
        var id = nextId('sg');
        return glassDefs(id) +
            '<rect x="14.55" y="16.6" width="2.9" height="11" rx="1.2" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + (w * 0.85) + '" opacity="' + fo + '"/>' +
            paintRect(7.2, 4, 17.6, 13, 3.4, fill, sw, w, fo, id) +
            insetRimRect(7.2, 4, 17.6, 13, 3.4, go) +
            '<path d="M10.6 8.4 H21.4 M10.6 11.8 H21.4" stroke="' + GLYPH + '" stroke-width="1.5" stroke-linecap="round" opacity="' + go + '"/>';
    }

    /** OLT. */
    function drawOlt(fill, sw, w, fo, go) {
        var id = nextId('ol');
        return glassDefs(id) +
            paintRect(4.2, 6, 23.6, 20, 5.2, fill, sw, w, fo, id) +
            insetRimRect(4.2, 6, 23.6, 20, 5.2, go) +
            '<rect x="8" y="10.2" width="3.1" height="2.3" rx="0.7" fill="#d1fae5" opacity="' + go + '"/>' +
            '<rect x="12.4" y="10.2" width="3.1" height="2.3" rx="0.7" fill="#d1fae5" opacity="' + go + '"/>' +
            '<rect x="16.8" y="10.2" width="3.1" height="2.3" rx="0.7" fill="#d1fae5" opacity="' + go + '"/>' +
            '<rect x="21.2" y="10.2" width="2.4" height="2.3" rx="0.7" fill="' + GLYPH + '" opacity="' + (go * 0.45) + '"/>' +
            '<rect x="8" y="16.8" width="6.2" height="3.2" rx="1" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<text x="21.4" y="19.8" text-anchor="middle" fill="' + GLYPH + '" font-size="4.2" font-weight="700" opacity="' + go + '">PON</text>';
    }

    /** Сплиттер. */
    function drawSplitter(fill, sw, w, fo, go) {
        var id = nextId('sp');
        return glassDefs(id) +
            paintCircle(16, 16, 11.8, fill, sw, w, fo, id) +
            insetRimCircle(16, 16, 11.8, go) +
            '<circle cx="16" cy="9.4" r="2.35" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<path d="M16 11.8 V15 M10 15 H22 M16 15 L11 20.6 M16 15 L16 20.6 M16 15 L21 20.6" fill="none" stroke="' + GLYPH + '" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" opacity="' + go + '"/>' +
            '<circle cx="11" cy="22" r="1.55" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="16" cy="22" r="1.55" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="21" cy="22" r="1.55" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    /** ONU. */
    function drawOnu(fill, sw, w, fo, go) {
        var id = nextId('on');
        return glassDefs(id) +
            paintRect(5.5, 7.2, 21, 17.4, 5, fill, sw, w, fo, id) +
            insetRimRect(5.5, 7.2, 21, 17.4, 5, go) +
            '<path d="M16 11.2 C18.4 11.2 19.7 12.8 19.7 15 C19.7 17.2 18.4 18.8 16 18.8 C13.6 18.8 12.3 17.2 12.3 15 C12.3 12.8 13.6 11.2 16 11.2 Z" fill="none" stroke="' + GLYPH + '" stroke-width="1.6" opacity="' + go + '"/>' +
            '<circle cx="16" cy="15" r="1.25" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<rect x="11.6" y="21" width="8.8" height="1.65" rx="0.8" fill="#d1fae5" opacity="' + go + '"/>';
    }

    /** Камера. */
    function drawCamera(fill, sw, w, fo, go) {
        var id = nextId('cm');
        var d = 'M10 8.8 H20.2 L23.2 13.4 V23 H7.6 L10 8.8 Z';
        return glassDefs(id) +
            paintPath(d, fill, sw, w, fo, id, 'round') +
            '<circle cx="16" cy="16.4" r="4.2" fill="none" stroke="' + GLYPH + '" stroke-width="1.65" opacity="' + go + '"/>' +
            '<circle cx="16" cy="16.4" r="1.95" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<circle cx="21.1" cy="11.1" r="1.1" fill="' + GLYPH + '" opacity="' + go + '"/>';
    }

    function cameraOnlineIndicator(online) {
        if (online !== true && online !== false) return '';
        var color = online ? '#22c55e' : '#94a3b8';
        var pulse = online
            ? '<animate attributeName="r" values="3.8;5;3.8" dur="1.6s" repeatCount="indefinite"/>' +
              '<animate attributeName="opacity" values="1;0.55;1" dur="1.6s" repeatCount="indefinite"/>'
            : '';
        return '<circle cx="26.4" cy="5.6" r="3.8" fill="' + color + '" stroke="#ffffff" stroke-width="1.45">' + pulse + '</circle>' +
            (online ? '<circle cx="26.4" cy="5.6" r="1.4" fill="#ffffff" opacity="0.5"/>' : '');
    }

    /** Медиаконвертер. */
    function drawMediaConverter(fill, sw, w, fo, go) {
        var id = nextId('mc');
        return glassDefs(id) +
            paintRect(7.4, 7.6, 17.2, 16.8, 4.4, fill, sw, w, fo, id) +
            insetRimRect(7.4, 7.6, 17.2, 16.8, 4.4, go) +
            '<path d="M3.4 14.6 H7.4" stroke="#86efac" stroke-width="1.75" stroke-linecap="round"/>' +
            '<circle cx="3.4" cy="14.6" r="1.35" fill="#86efac"/>' +
            '<path d="M24.6 11.4 V20.6" stroke="' + GLYPH + '" stroke-width="1.45" opacity="' + go + '"/>' +
            '<path d="M24.6 12.4 H27.8 V19.6 H24.6 Z" fill="' + GLYPH + '" opacity="' + go + '"/>' +
            '<path d="M11.8 16 H20.2" stroke="' + GLYPH + '" stroke-width="1.45" stroke-linecap="round" opacity="' + go + '"/>';
    }

    /** Радиомост. */
    function drawRadioBridge(fill, sw, w, fo, go) {
        var id = nextId('rb');
        return glassDefs(id) +
            paintCircle(16, 16, 11.8, fill, sw, w, fo, id) +
            insetRimCircle(16, 16, 11.8, go) +
            '<path d="M16 7.4 C12 7.4 9.4 10 9.4 13" fill="none" stroke="' + GLYPH + '" stroke-width="1.55" stroke-linecap="round" opacity="' + go + '"/>' +
            '<path d="M16 7.4 C20 7.4 22.6 10 22.6 13" fill="none" stroke="' + GLYPH + '" stroke-width="1.55" stroke-linecap="round" opacity="' + go + '"/>' +
            '<path d="M16 9.4 C13.6 9.4 11.8 10.8 11.8 13" fill="none" stroke="' + GLYPH + '" stroke-width="1.3" stroke-linecap="round" opacity="' + (go * 0.75) + '"/>' +
            '<path d="M16 9.4 C18.4 9.4 20.2 10.8 20.2 13" fill="none" stroke="' + GLYPH + '" stroke-width="1.3" stroke-linecap="round" opacity="' + (go * 0.75) + '"/>' +
            '<rect x="10.8" y="14.4" width="10.4" height="7.6" rx="2.2" fill="' + GLYPH + '" opacity="' + (go * 0.18) + '"/>' +
            '<rect x="10.8" y="14.4" width="10.4" height="7.6" rx="2.2" fill="none" stroke="' + GLYPH + '" stroke-width="1.45" opacity="' + go + '"/>' +
            '<path d="M13.4 18.2 H18.6" stroke="' + GLYPH + '" stroke-width="1.4" stroke-linecap="round" opacity="' + go + '"/>';
    }

    /** Коммутатор. */
    function drawSwitch(fill, sw, w, fo, go) {
        var id = nextId('sw');
        var ports = '';
        var px = [9.8, 13.3, 16.7, 20.2];
        for (var i = 0; i < px.length; i++) {
            ports += '<rect x="' + (px[i] - 1.1) + '" y="11.2" width="2.2" height="2.2" rx="0.5" fill="' + GLYPH + '" opacity="' + go + '"/>';
            ports += '<rect x="' + (px[i] - 1.1) + '" y="16.4" width="2.2" height="2.2" rx="0.5" fill="' + GLYPH + '" opacity="' + go + '"/>';
        }
        return glassDefs(id) +
            paintRect(4.5, 6.8, 23, 18.4, 5.2, fill, sw, w, fo, id) +
            insetRimRect(4.5, 6.8, 23, 18.4, 5.2, go) +
            ports +
            '<path d="M8.8 21.8 H23.2" stroke="' + GLYPH + '" stroke-width="1.15" stroke-linecap="round" opacity="' + (go * 0.45) + '"/>';
    }

    function drawGroup(type, fill, sw, w, fo, go, count, hasAggregation) {
        var label = String(count == null ? 1 : count);
        var id = nextId('gr');
        if (type === 'crossGroup') {
            return glassDefs(id) +
                paintRect(3.5, 5, 25, 22, 6, fill, sw, w, fo, id) +
                insetRimRect(3.5, 5, 25, 22, 6, go) +
                '<text x="16" y="19.3" text-anchor="middle" fill="' + GLYPH + '" font-size="10" font-weight="700" opacity="' + go + '">' + label + '</text>';
        }
        var nodeFill = hasAggregation ? COLORS.nodeAggregation : fill;
        return glassDefs(id) +
            paintCircle(16, 16, 12, nodeFill, sw, w, fo, id) +
            insetRimCircle(16, 16, 12, go) +
            '<text x="16" y="19.7" text-anchor="middle" fill="' + GLYPH + '" font-size="10" font-weight="700" opacity="' + go + '">' + label + '</text>';
    }

    function buildInnerMarkup(type, options) {
        options = options || {};
        var variant = options.variant || 'normal';
        var nodeKind = options.nodeKind || 'network';
        var fill = getColor(type, nodeKind);
        var sw = getOutlineStroke(variant);
        var w = strokeWidth(variant);
        var fo = fillOpacity(variant);
        var go = glyphOpacity(variant);

        var body = '';
        switch (type) {
            case 'support': body = drawSupport(fill, sw, w, fo, go); break;
            case 'sleeve': body = drawSleeve(fill, sw, w, fo, go); break;
            case 'spliceCassette': body = drawSpliceCassette(fill, sw, w, fo, go); break;
            case 'cross': body = drawCross(fill, sw, w, fo, go); break;
            case 'node': body = drawNode(fill, sw, w, fo, go, nodeKind); break;
            case 'attachment': body = drawAttachment(fill, sw, w, fo, go); break;
            case 'manhole': body = drawManhole(fill, sw, w, fo, go); break;
            case 'signalPost': body = drawSignalPost(fill, sw, w, fo, go); break;
            case 'cabinet': body = drawCabinet(fill, sw, w, fo, go); break;
            case 'olt': body = drawOlt(fill, sw, w, fo, go); break;
            case 'splitter': body = drawSplitter(fill, sw, w, fo, go); break;
            case 'onu': body = drawOnu(fill, sw, w, fo, go); break;
            case 'camera':
                body = drawCamera(fill, sw, w, fo, go) + cameraOnlineIndicator(options.cameraOnline);
                break;
            case 'mediaConverter': body = drawMediaConverter(fill, sw, w, fo, go); break;
            case 'radioBridge': body = drawRadioBridge(fill, sw, w, fo, go); break;
            case 'switch': body = drawSwitch(fill, sw, w, fo, go); break;
            case 'crossGroup': body = drawGroup('crossGroup', COLORS.cross, sw, w, fo, go, options.groupCount); break;
            case 'nodeGroup': body = drawGroup('nodeGroup', COLORS.node, sw, w, fo, go, options.groupCount, options.hasAggregation); break;
            default:
                body = '<circle cx="16" cy="16" r="10.8" fill="' + COLORS.default + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
                    '<circle cx="16" cy="16" r="2.8" fill="' + GLYPH + '" opacity="' + go + '"/>';
        }
        return selectionRing(variant, fill) + body + zabbixStatusOverlay(options.zabbixSeverity);
    }

    function zabbixSeverityColor(severity) {
        var s = parseInt(severity, 10);
        if (s === 1) return '#3b82f6';
        if (s === 2) return '#eab308';
        if (s === 3) return '#f97316';
        if (s === 4) return '#ef4444';
        if (s === 5) return '#c026d3';
        return '#16a34a';
    }

    function zabbixSeveritySoft(severity) {
        var s = parseInt(severity, 10);
        if (s === 1) return 'rgba(59,130,246,0.28)';
        if (s === 2) return 'rgba(234,179,8,0.30)';
        if (s === 3) return 'rgba(249,115,22,0.32)';
        if (s === 4) return 'rgba(239,68,68,0.34)';
        if (s === 5) return 'rgba(192,38,211,0.36)';
        return 'rgba(22,163,74,0.22)';
    }

    function zabbixStatusOverlay(severity) {
        if (severity == null || severity === '' || isNaN(Number(severity))) return '';
        var s = Math.max(0, Math.min(5, parseInt(severity, 10) || 0));
        var c = zabbixSeverityColor(s);
        var soft = zabbixSeveritySoft(s);
        var outline = isDarkMapTheme() ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.92)';
        var html = '';

        html += '<circle cx="16" cy="16" r="14.2" fill="none" stroke="' + soft + '" stroke-width="' + (s === 0 ? '3.2' : '5.2') + '"/>';
        html += '<circle cx="16" cy="16" r="13.55" fill="none" stroke="' + outline + '" stroke-width="3.1" opacity="0.9"/>';

        var pulse = '';
        if (s >= 4) {
            pulse = '<animate attributeName="stroke-opacity" values="1;0.35;1" dur="' + (s >= 5 ? '0.85s' : '1.15s') + '" repeatCount="indefinite"/>';
        } else if (s >= 2) {
            pulse = '<animate attributeName="stroke-opacity" values="1;0.55;1" dur="1.8s" repeatCount="indefinite"/>';
        }
        html += '<circle cx="16" cy="16" r="13.55" fill="none" stroke="' + c + '" stroke-width="' + (s === 0 ? '1.9' : '2.45') + '" stroke-opacity="0.98">' +
            pulse + '</circle>';

        var badgeCx = 26.2;
        var badgeCy = 5.8;
        var badgeR = s === 0 ? 3.4 : 4.1;
        html += '<circle cx="' + badgeCx + '" cy="' + badgeCy + '" r="' + (badgeR + 1.15) + '" fill="' + outline + '" opacity="0.95"/>';
        html += '<circle cx="' + badgeCx + '" cy="' + badgeCy + '" r="' + badgeR + '" fill="' + c + '">';
        if (s >= 4) {
            html += '<animate attributeName="r" values="' + badgeR + ';' + (badgeR + 0.7) + ';' + badgeR + '" dur="' + (s >= 5 ? '0.85s' : '1.15s') + '" repeatCount="indefinite"/>';
        }
        html += '</circle>';
        if (s === 0) {
            html += '<circle cx="' + badgeCx + '" cy="' + badgeCy + '" r="1.35" fill="#ffffff" opacity="0.9"/>';
        } else if (s >= 3) {
            html += '<rect x="' + (badgeCx - 0.55) + '" y="' + (badgeCy - 1.9) + '" width="1.1" height="2.4" rx="0.45" fill="#ffffff" opacity="0.95"/>';
            html += '<circle cx="' + badgeCx + '" cy="' + (badgeCy + 1.55) + '" r="0.65" fill="#ffffff" opacity="0.95"/>';
        } else {
            html += '<circle cx="' + badgeCx + '" cy="' + badgeCy + '" r="1.5" fill="#ffffff" opacity="0.55"/>';
        }

        if (s >= 5) {
            html += '<circle cx="16" cy="16" r="15.1" fill="none" stroke="' + c + '" stroke-width="1.4" stroke-opacity="0.55">' +
                '<animate attributeName="r" values="14.2;15.4;14.2" dur="0.85s" repeatCount="indefinite"/>' +
                '<animate attributeName="stroke-opacity" values="0.55;0.12;0.55" dur="0.85s" repeatCount="indefinite"/>' +
                '</circle>';
        }

        return html;
    }

    function getIconMetrics(type, variant, options) {
        var large = { support: 1, sleeve: 1, spliceCassette: 1, cross: 1, node: 1, attachment: 1, manhole: 1, signalPost: 1, cabinet: 1, olt: 1, splitter: 1, onu: 1, camera: 1, mediaConverter: 1, radioBridge: 1, switch: 1, crossGroup: 1, nodeGroup: 1 };
        var isLarge = !!large[type];
        var sev = options && options.zabbixSeverity != null && !isNaN(Number(options.zabbixSeverity))
            ? Math.max(0, Math.min(5, parseInt(options.zabbixSeverity, 10) || 0))
            : null;
        var statusBoost = sev == null ? 0 : (sev >= 4 ? 6 : (sev >= 1 ? 4 : 2));
        if (type === 'support') {
            var supportSize = variant === 'selected' ? 30 : (variant === 'hover' ? 28 : 26);
            return {
                clickableSize: (variant === 'selected' ? 48 : 44) + statusBoost,
                iconSize: supportSize + (statusBoost ? 2 : 0)
            };
        }
        if (variant === 'selected') {
            return {
                clickableSize: 50 + statusBoost,
                iconSize: type === 'crossGroup' || type === 'nodeGroup' ? 40 : (type === 'node' || type === 'cross' || type === 'switch' ? 38 : (type === 'attachment' ? 24 : 34)) + (statusBoost ? 2 : 0)
            };
        }
        if (variant === 'hover') {
            return {
                clickableSize: 44 + statusBoost,
                iconSize: type === 'crossGroup' || type === 'nodeGroup' ? 36 : (type === 'attachment' ? 24 : (isLarge ? 32 : 28)) + (statusBoost ? 2 : 0)
            };
        }
        return {
            clickableSize: 44 + statusBoost,
            iconSize: (type === 'attachment' ? 24 : (isLarge ? 32 : 28)) + (statusBoost ? 2 : 0)
        };
    }

    function buildIconSvg(type, options) {
        var metrics = getIconMetrics(type, options && options.variant, options);
        var inner = buildInnerMarkup(type, options);
        return '<svg width="' + metrics.iconSize + '" height="' + metrics.iconSize + '" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
    }

    function buildPlacemarkIcon(type, options) {
        var metrics = getIconMetrics(type, options && options.variant, options);
        var inner = buildInnerMarkup(type, options);
        var scale = metrics.iconSize / 32;
        var offset = (metrics.clickableSize - metrics.iconSize) / 2;
        var clickableSvg = '<svg width="' + metrics.clickableSize + '" height="' + metrics.clickableSize + '" viewBox="0 0 ' + metrics.clickableSize + ' ' + metrics.clickableSize + '" xmlns="http://www.w3.org/2000/svg">' +
            '<rect width="' + metrics.clickableSize + '" height="' + metrics.clickableSize + '" fill="transparent"/>' +
            '<g transform="translate(' + offset + ',' + offset + ') scale(' + scale + ')">' + inner + '</g></svg>';
        var href = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
        return {
            href: href,
            clickableSize: metrics.clickableSize,
            iconSize: metrics.iconSize,
            iconImageSize: [metrics.clickableSize, metrics.clickableSize],
            iconImageOffset: [-metrics.clickableSize / 2, -metrics.clickableSize / 2]
        };
    }

    function applyToPlacemark(placemark, type, options) {
        if (!placemark || !placemark.options) return;
        var icon = buildPlacemarkIcon(type, options);
        placemark.options.set('iconImageHref', icon.href);
        placemark.options.set('iconImageSize', icon.iconImageSize);
        placemark.options.set('iconImageOffset', icon.iconImageOffset);
    }

    global.MapIcons = {
        COLORS: COLORS,
        getMapTheme: getMapTheme,
        isDarkMapTheme: isDarkMapTheme,
        getNodeColor: getNodeColor,
        buildPlacemarkIcon: buildPlacemarkIcon,
        buildIconSvg: buildIconSvg,
        applyToPlacemark: applyToPlacemark
    };
})(typeof window !== 'undefined' ? window : this);
