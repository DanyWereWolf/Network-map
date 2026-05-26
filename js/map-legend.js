/**
 * Типы кабелей и цвета маршрутов жил — единый источник для карты, сайдбара и легенды.
 */
(function(global) {
    var FIBER_MAP_COLOR = '#00aa00';
    var FIBER_MAP_WIDTH = 3;

    var CABLE_TYPES = [
        { id: 'fiber', label: 'ВОЛС', short: 'ВОЛС', color: FIBER_MAP_COLOR, width: FIBER_MAP_WIDTH, tone: 'fiber' },
        { id: 'fiber4', label: 'ВОЛС 4 жилы', short: '4 жилы', color: FIBER_MAP_COLOR, width: FIBER_MAP_WIDTH, tone: 'fiber4', layViaUi: false },
        { id: 'fiber8', label: 'ВОЛС 8 жил', short: '8 жил', color: FIBER_MAP_COLOR, width: FIBER_MAP_WIDTH, tone: 'fiber8', layViaUi: false },
        { id: 'fiber16', label: 'ВОЛС 16 жил', short: '16 жил', color: FIBER_MAP_COLOR, width: FIBER_MAP_WIDTH, tone: 'fiber16', layViaUi: false },
        { id: 'fiber24', label: 'ВОЛС 24 жилы', short: '24 жилы', color: FIBER_MAP_COLOR, width: FIBER_MAP_WIDTH, tone: 'fiber24', layViaUi: false },
        { id: 'copper', label: 'Медный кабель', short: 'Медь', color: '#b45309', width: 3, tone: 'copper', layViaUi: false }
    ];

    var FIBER_ROUTE_LEGEND = [
        { color: '#22c55e', label: 'Кросс / муфта → узел или ONU', tag: 'жила' },
        { color: '#0ea5e9', label: 'Кросс / муфта → OLT', tag: 'жила' },
        { color: '#14b8a6', label: 'Кросс / муфта → медиаконвертер', tag: 'жила' },
        { color: '#3b82f6', label: 'Кросс / муфта → сплиттер (вход)', tag: 'жила' },
        { color: '#a855f7', label: 'Сплиттер → ONU (выход)', tag: 'выход' },
        { color: '#f97316', label: 'Сплиттер → сплиттер (выход)', tag: 'выход' }
    ];

    function getCableMeta(type) {
        if (global.FiberCableConfig && global.FiberCableConfig.isOpticalCableType(type)) {
            return { id: 'fiber', label: 'ВОЛС', short: 'ВОЛС', color: FIBER_MAP_COLOR, width: FIBER_MAP_WIDTH, tone: 'fiber' };
        }
        for (var i = 0; i < CABLE_TYPES.length; i++) {
            if (CABLE_TYPES[i].id === type) return CABLE_TYPES[i];
        }
        return null;
    }

    function getCableTypesForPicker() {
        return CABLE_TYPES.filter(function(t) { return t.layViaUi !== false; });
    }

    function escapeLegendHtml(text) {
        if (typeof escapeHtml === 'function') return escapeHtml(text);
        return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderSidebarLegend(containerId) {
        var root = document.getElementById(containerId || 'legend-content');
        if (!root) return;

        var html = '';

        html += '<div class="legend-group">';
        html += '<p class="legend-group-title">Магистраль (ВОЛС)</p>';
        html += '<p class="legend-group-hint">На карте все ВОЛС одного вида; число жил и цвета настраиваются при прокладке и в карточке кабеля</p>';
        html += '<div class="legend-item legend-item--cable">' +
            '<span class="legend-line legend-line--solid" style="--legend-color:var(--fiber-map-line);--legend-width:' + (FIBER_MAP_WIDTH + 1) + 'px" aria-hidden="true"></span>' +
            '<span class="legend-text">ВОЛС</span></div>';
        html += '</div>';

        var copper = getCableMeta('copper');
        if (copper) {
            html += '<div class="legend-group">';
            html += '<p class="legend-group-title">Медь</p>';
            html += '<div class="legend-item legend-item--cable">' +
                '<span class="legend-line legend-line--solid" style="--legend-color:' + copper.color + ';--legend-width:4px" aria-hidden="true"></span>' +
                '<span class="legend-text">' + escapeLegendHtml(copper.label) + '</span></div>';
            html += '<p class="legend-group-hint">Прокладка из карточки узла (коммутатор → порт), отдельного коммутатора или медиаконвертера с оптикой. К камере — только от коммутатора.</p>';
            html += '</div>';
        }

        html += '<div class="legend-group">';
        html += '<p class="legend-group-title">Маршруты жил (пунктир)</p>';
        html += '<p class="legend-group-hint">Отображаются при подключении жил в карточках кросса и муфты</p>';
        FIBER_ROUTE_LEGEND.forEach(function(r) {
            html += '<div class="legend-item legend-item--route">' +
                '<span class="legend-line legend-line--dash" style="--legend-color:' + r.color + '" aria-hidden="true"></span>' +
                '<span class="legend-text">' + escapeLegendHtml(r.label) +
                (r.tag ? ' <span class="legend-item-tag">' + escapeLegendHtml(r.tag) + '</span>' : '') +
                '</span></div>';
        });
        html += '</div>';

        root.innerHTML = html;
    }

    function renderCableTypePicker(containerId) {
        if (global.FiberCableConfig && global.FiberCableConfig.renderCableLayPanel) {
            global.FiberCableConfig.renderCableLayPanel();
            return;
        }
        var root = document.getElementById(containerId || 'cableTypePicker');
        if (!root) return;
        root.innerHTML = '<div class="cable-lay-fiber-visual"><span class="cable-lay-fiber-line"></span><span class="cable-lay-fiber-label">ВОЛС</span></div>';
    }

    global.MapLegendConfig = {
        CABLE_TYPES: CABLE_TYPES,
        FIBER_ROUTE_LEGEND: FIBER_ROUTE_LEGEND,
        getCableMeta: getCableMeta,
        getCableTypesForPicker: getCableTypesForPicker,
        renderSidebarLegend: renderSidebarLegend,
        renderCableTypePicker: renderCableTypePicker
    };
})(typeof window !== 'undefined' ? window : this);
