/**
 * SVG-иконки объектов на карте (единый стиль, цвета как в фильтре боковой панели).
 */
(function (global) {
    var COLORS = {
        support: '#3b82f6',
        sleeve: '#f43f5e',
        cross: '#8b5cf6',
        node: '#22c55e',
        nodeAggregation: '#ef4444',
        attachment: '#64748b',
        olt: '#0ea5e9',
        splitter: '#a855f7',
        onu: '#06b6d4',
        camera: '#475569',
        mediaConverter: '#14b8a6',
        switch: '#f97316',
        default: '#94a3b8'
    };

    var STROKE_SELECTED = '#fef08a';

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

    /** Контур и детали: тёмный на светлой карте, светлый на тёмной. */
    function getOutlineStroke(variant) {
        var dark = isDarkMapTheme();
        if (variant === 'hover') {
            return dark ? '#e0f2fe' : '#1e293b';
        }
        return dark ? '#ffffff' : '#0f172a';
    }

    function fillOpacity(variant) {
        return variant === 'phantom' ? 0.58 : 1;
    }

    function strokeWidth(variant) {
        var extra = isDarkMapTheme() ? 0 : 0.35;
        if (variant === 'selected') return 2.4 + extra;
        if (variant === 'hover') return 2.1 + extra;
        return 1.9 + extra;
    }

    function detailOpacity(variant) {
        if (variant === 'phantom') return 0.65;
        if (variant === 'hover') return 0.95;
        return 1;
    }

    function getNodeColor(nodeKind) {
        return nodeKind === 'aggregation' ? COLORS.nodeAggregation : COLORS.node;
    }

    function getColor(type, nodeKind) {
        if (type === 'node') return getNodeColor(nodeKind);
        return COLORS[type] || COLORS.default;
    }

    function selectionRing(variant) {
        if (variant !== 'selected') return '';
        return '<circle cx="16" cy="16" r="15.2" fill="none" stroke="' + STROKE_SELECTED + '" stroke-width="2.2" opacity="0.95"/>';
    }

    function drawSupport(fill, sw, w, fo, wo) {
        return '<path d="M16 4 L17.5 9 L16.8 27 L15.2 27 L14.5 9 Z" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<path d="M11 10 H21" stroke="' + sw + '" stroke-width="' + (w * 0.85) + '" stroke-linecap="round" opacity="' + wo + '"/>' +
            '<path d="M12.5 10 V13 M19.5 10 V13" stroke="' + sw + '" stroke-width="1.2" stroke-linecap="round" opacity="' + wo + '"/>';
    }

    function drawSleeve(fill, sw, w, fo, wo) {
        return '<polygon points="16,3 26,8 26,20 16,25 6,20 6,8" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<path d="M8 16 H24" stroke="' + sw + '" stroke-width="1.4" stroke-linecap="round" opacity="' + wo + '"/>' +
            '<circle cx="16" cy="16" r="3.2" fill="' + sw + '" opacity="' + wo + '"/>';
    }

    function drawCross(fill, sw, w, fo, wo) {
        var ports = '';
        var xs = [10, 16, 22];
        var ys = [11, 16, 21];
        for (var i = 0; i < xs.length; i++) {
            for (var j = 0; j < ys.length; j++) {
                ports += '<circle cx="' + xs[i] + '" cy="' + ys[j] + '" r="1.6" fill="' + sw + '" opacity="' + wo + '"/>';
            }
        }
        return '<rect x="5" y="6" width="22" height="20" rx="3" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<line x1="10" y1="6" x2="10" y2="26" stroke="' + sw + '" stroke-width="1" opacity="' + (wo * 0.75) + '"/>' +
            '<line x1="16" y1="6" x2="16" y2="26" stroke="' + sw + '" stroke-width="1" opacity="' + (wo * 0.75) + '"/>' +
            '<line x1="22" y1="6" x2="22" y2="26" stroke="' + sw + '" stroke-width="1" opacity="' + (wo * 0.75) + '"/>' +
            ports;
    }

    function drawNode(fill, sw, w, fo, wo, nodeKind) {
        if (nodeKind === 'aggregation') {
            return '<path d="M16 4 L27 16 L16 28 L5 16 Z" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
                '<circle cx="16" cy="16" r="4" fill="' + sw + '" opacity="' + wo + '"/>' +
                '<circle cx="16" cy="16" r="2" fill="' + fill + '"/>';
        }
        return '<rect x="6" y="6" width="20" height="20" rx="5" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<circle cx="10" cy="10" r="1.8" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<circle cx="22" cy="10" r="1.8" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<circle cx="10" cy="22" r="1.8" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<circle cx="22" cy="22" r="1.8" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<circle cx="16" cy="16" r="3.5" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<circle cx="16" cy="16" r="1.8" fill="' + fill + '"/>';
    }

    function drawAttachment(fill, sw, w, fo, wo) {
        return '<circle cx="16" cy="16" r="11" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<path d="M12 14 C12 10 20 10 20 14 C20 18 16 20 16 24" stroke="' + sw + '" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="' + wo + '"/>' +
            '<circle cx="16" cy="24" r="1.5" fill="' + sw + '" opacity="' + wo + '"/>';
    }

    function drawOlt(fill, sw, w, fo, wo) {
        return '<rect x="5" y="7" width="22" height="18" rx="2.5" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<rect x="8" y="11" width="3" height="2.2" rx="0.6" fill="#4ade80" opacity="' + wo + '"/>' +
            '<rect x="13" y="11" width="3" height="2.2" rx="0.6" fill="#4ade80" opacity="' + wo + '"/>' +
            '<rect x="18" y="11" width="3" height="2.2" rx="0.6" fill="#4ade80" opacity="' + wo + '"/>' +
            '<path d="M7 17 L11 17 L11 19 L7 19 Z" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<text x="16" y="21" text-anchor="middle" fill="' + sw + '" font-size="4" font-weight="700" opacity="' + wo + '">PON</text>';
    }

    function drawSplitter(fill, sw, w, fo, wo) {
        return '<circle cx="16" cy="9" r="4.5" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<path d="M16 13.5 V17" stroke="' + sw + '" stroke-width="1.6" opacity="' + wo + '"/>' +
            '<path d="M10 17 H22" stroke="' + sw + '" stroke-width="1.6" opacity="' + wo + '"/>' +
            '<path d="M16 17 L11.5 22 M16 17 L20.5 22" stroke="' + sw + '" stroke-width="1.4" opacity="' + wo + '"/>' +
            '<circle cx="11.5" cy="22.5" r="2" fill="' + fill + '" stroke="' + sw + '" stroke-width="1.2"/>' +
            '<circle cx="16" cy="22.5" r="2" fill="' + fill + '" stroke="' + sw + '" stroke-width="1.2"/>' +
            '<circle cx="20.5" cy="22.5" r="2" fill="' + fill + '" stroke="' + sw + '" stroke-width="1.2"/>';
    }

    function drawOnu(fill, sw, w, fo, wo) {
        return '<rect x="7" y="9" width="18" height="14" rx="2" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<path d="M16 12 C18 12 19 13.5 19 15.5 C19 17.5 18 19 16 19 C14 19 13 17.5 13 15.5 C13 13.5 14 12 16 12 Z" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<circle cx="16" cy="15.5" r="1.2" fill="' + fill + '"/>' +
            '<rect x="12" y="20" width="8" height="1.5" rx="0.5" fill="#4ade80" opacity="' + wo + '"/>';
    }

    function drawCamera(fill, sw, w, fo, wo) {
        return '<path d="M11 10 H21 L23 14 V22 H9 L11 10 Z" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<circle cx="16" cy="16" r="4" fill="' + sw + '" stroke="' + sw + '" stroke-width="0.8" opacity="' + wo + '"/>' +
            '<circle cx="16" cy="16" r="2.2" fill="' + fill + '"/>' +
            '<circle cx="21" cy="11" r="1" fill="' + sw + '" opacity="' + wo + '"/>';
    }

    function cameraOnlineIndicator(online) {
        if (online !== true && online !== false) return '';
        var color = online ? '#22c55e' : '#94a3b8';
        return '<circle cx="26.5" cy="5.5" r="4" fill="' + color + '" stroke="#ffffff" stroke-width="1.4"/>' +
            (online ? '<circle cx="26.5" cy="5.5" r="1.6" fill="#ffffff" opacity="0.45"/>' : '');
    }

    function drawMediaConverter(fill, sw, w, fo, wo) {
        return '<rect x="8" y="9" width="16" height="14" rx="2" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<path d="M4 14 L8 14" stroke="#22c55e" stroke-width="1.6" stroke-linecap="round"/>' +
            '<circle cx="4" cy="14" r="1.2" fill="#22c55e"/>' +
            '<path d="M24 12 V18" stroke="' + sw + '" stroke-width="1.4" opacity="' + wo + '"/>' +
            '<path d="M24 13 H27 V17 H24 Z" fill="' + sw + '" opacity="' + wo + '"/>' +
            '<path d="M12 16 H20" stroke="' + sw + '" stroke-width="1.2" opacity="' + (wo * 0.7) + '"/>';
    }

    function drawSwitch(fill, sw, w, fo, wo) {
        var ports = '';
        var px = [10, 14, 18, 22];
        for (var i = 0; i < px.length; i++) {
            ports += '<rect x="' + (px[i] - 1) + '" y="11" width="2" height="2" rx="0.4" fill="' + sw + '" opacity="' + wo + '"/>';
            ports += '<rect x="' + (px[i] - 1) + '" y="17" width="2" height="2" rx="0.4" fill="' + sw + '" opacity="' + wo + '"/>';
        }
        return '<rect x="6" y="8" width="20" height="16" rx="2.5" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            ports +
            '<path d="M9 21 H23" stroke="' + sw + '" stroke-width="1" opacity="' + (wo * 0.5) + '"/>';
    }

    function drawGroup(type, fill, sw, w, fo, count, hasAggregation) {
        var label = String(count == null ? 1 : count);
        if (type === 'crossGroup') {
            return '<rect x="4" y="6" width="24" height="20" rx="3" fill="' + fill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
                '<text x="16" y="18" text-anchor="middle" fill="' + sw + '" font-size="9" font-weight="700">' + label + '</text>';
        }
        var nodeFill = hasAggregation ? COLORS.nodeAggregation : fill;
        return '<circle cx="16" cy="16" r="12" fill="' + nodeFill + '" stroke="' + sw + '" stroke-width="' + w + '" opacity="' + fo + '"/>' +
            '<text x="16" y="19" text-anchor="middle" fill="' + sw + '" font-size="9" font-weight="700">' + label + '</text>';
    }

    function buildInnerMarkup(type, options) {
        options = options || {};
        var variant = options.variant || 'normal';
        var nodeKind = options.nodeKind || 'network';
        var fill = getColor(type, nodeKind);
        var sw = getOutlineStroke(variant);
        var w = strokeWidth(variant);
        var fo = fillOpacity(variant);
        var wo = detailOpacity(variant);

        var body = '';
        switch (type) {
            case 'support': body = drawSupport(fill, sw, w, fo, wo); break;
            case 'sleeve': body = drawSleeve(fill, sw, w, fo, wo); break;
            case 'cross': body = drawCross(fill, sw, w, fo, wo); break;
            case 'node': body = drawNode(fill, sw, w, fo, wo, nodeKind); break;
            case 'attachment': body = drawAttachment(fill, sw, w, fo, wo); break;
            case 'olt': body = drawOlt(fill, sw, w, fo, wo); break;
            case 'splitter': body = drawSplitter(fill, sw, w, fo, wo); break;
            case 'onu': body = drawOnu(fill, sw, w, fo, wo); break;
            case 'camera':
                body = drawCamera(fill, sw, w, fo, wo) + cameraOnlineIndicator(options.cameraOnline);
                break;
            case 'mediaConverter': body = drawMediaConverter(fill, sw, w, fo, wo); break;
            case 'switch': body = drawSwitch(fill, sw, w, fo, wo); break;
            case 'crossGroup': body = drawGroup('crossGroup', COLORS.cross, sw, w, fo, options.groupCount); break;
            case 'nodeGroup': body = drawGroup('nodeGroup', COLORS.node, sw, w, fo, options.groupCount, options.hasAggregation); break;
            default:
                body = '<circle cx="16" cy="16" r="10" fill="' + COLORS.default + '" stroke="' + sw + '" stroke-width="' + w + '"/>';
        }
        return selectionRing(variant) + body;
    }

    function getIconMetrics(type, variant) {
        var large = { support: 1, sleeve: 1, cross: 1, node: 1, attachment: 1, olt: 1, splitter: 1, onu: 1, camera: 1, mediaConverter: 1, switch: 1, crossGroup: 1, nodeGroup: 1 };
        var isLarge = !!large[type];
        if (variant === 'selected') {
            return {
                clickableSize: 50,
                iconSize: type === 'crossGroup' || type === 'nodeGroup' ? 40 : (type === 'node' || type === 'cross' || type === 'switch' ? 38 : (type === 'support' ? 26 : 34))
            };
        }
        if (variant === 'hover') {
            return {
                clickableSize: 44,
                iconSize: type === 'crossGroup' || type === 'nodeGroup' ? 36 : (isLarge ? 32 : (type === 'support' ? 26 : 28))
            };
        }
        return {
            clickableSize: 44,
            iconSize: isLarge ? 32 : (type === 'support' ? 22 : 28)
        };
    }

    function buildIconSvg(type, options) {
        var metrics = getIconMetrics(type, options && options.variant);
        var inner = buildInnerMarkup(type, options);
        return '<svg width="' + metrics.iconSize + '" height="' + metrics.iconSize + '" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
    }

    function buildPlacemarkIcon(type, options) {
        var metrics = getIconMetrics(type, options && options.variant);
        var inner = buildInnerMarkup(type, options);
        var offset = (metrics.clickableSize - metrics.iconSize) / 2;
        var clickableSvg = '<svg width="' + metrics.clickableSize + '" height="' + metrics.clickableSize + '" viewBox="0 0 ' + metrics.clickableSize + ' ' + metrics.clickableSize + '" xmlns="http://www.w3.org/2000/svg">' +
            '<rect width="' + metrics.clickableSize + '" height="' + metrics.clickableSize + '" fill="transparent"/>' +
            '<g transform="translate(' + offset + ',' + offset + ')">' + inner + '</g></svg>';
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
