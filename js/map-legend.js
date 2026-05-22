/**
 * Типы кабелей и цвета маршрутов жил — единый источник для карты, сайдбара и легенды.
 */
(function(global) {
    var CABLE_TYPES = [
        { id: 'fiber4', label: 'ВОЛС 4 жилы', short: '4 жилы', color: '#00FF00', width: 2, tone: 'fiber4' },
        { id: 'fiber8', label: 'ВОЛС 8 жил', short: '8 жил', color: '#00AA00', width: 3, tone: 'fiber8' },
        { id: 'fiber16', label: 'ВОЛС 16 жил', short: '16 жил', color: '#008800', width: 4, tone: 'fiber16' },
        { id: 'fiber24', label: 'ВОЛС 24 жилы', short: '24 жилы', color: '#006600', width: 5, tone: 'fiber24' },
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
        html += '<p class="legend-group-hint">Сплошная линия; толщина растёт с числом жил</p>';
        getCableTypesForPicker().forEach(function(t) {
            html += '<div class="legend-item legend-item--cable">' +
                '<span class="legend-line legend-line--solid" style="--legend-color:' + t.color + ';--legend-width:' + Math.min(t.width + 1, 6) + 'px" aria-hidden="true"></span>' +
                '<span class="legend-text">' + escapeLegendHtml(t.label) + '</span></div>';
        });
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
        var root = document.getElementById(containerId || 'cableTypePicker');
        var select = document.getElementById('cableType');
        if (!root || !select) return;
        root.innerHTML = '';
        getCableTypesForPicker().forEach(function(t) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cable-type-chip cable-type-chip--' + t.tone + (select.value === t.id ? ' cable-type-chip--active' : '');
            btn.setAttribute('data-cable', t.id);
            btn.setAttribute('title', t.label);
            btn.innerHTML =
                '<span class="cable-type-chip-line" style="--cable-color:' + t.color + ';--cable-width:' + t.width + 'px" aria-hidden="true"></span>' +
                '<span class="cable-type-chip-text">' + escapeLegendHtml(t.short) + '</span>';
            root.appendChild(btn);
        });
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
