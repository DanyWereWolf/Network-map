// ==================== Утилиты ====================

// Генерация уникального ID
function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Получает уникальный ID объекта (создаёт если нет)
function getObjectUniqueId(obj) {
    if (!obj || !obj.properties) return null;
    let id = obj.properties.get('uniqueId');
    if (!id) {
        const type = obj.properties.get('type') || 'obj';
        id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        obj.properties.set('uniqueId', id);
    }
    return id;
}

// Экранирование HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Вычисление расстояния между двумя координатами (в метрах)
function calculateDistance(coords1, coords2) {
    const R = 6371000; // Радиус Земли в метрах
    const lat1 = coords1[0] * Math.PI / 180;
    const lat2 = coords2[0] * Math.PI / 180;
    const deltaLat = (coords2[0] - coords1[0]) * Math.PI / 180;
    const deltaLon = (coords2[1] - coords1[1]) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// Вычисление расстояния от точки до линии
function pointToLineDistance(point, lineStart, lineEnd) {
    const A = point[0] - lineStart[0];
    const B = point[1] - lineStart[1];
    const C = lineEnd[0] - lineStart[0];
    const D = lineEnd[1] - lineStart[1];

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = lineStart[0];
        yy = lineStart[1];
    } else if (param > 1) {
        xx = lineEnd[0];
        yy = lineEnd[1];
    } else {
        xx = lineStart[0] + param * C;
        yy = lineStart[1] + param * D;
    }

    const dx = point[0] - xx;
    const dy = point[1] - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
}

// Получить название типа объекта
function getObjectTypeName(type) {
    switch (type) {
        case 'support': return 'Опора связи';
        case 'sleeve': return 'Кабельная муфта';
        case 'cross': return 'Оптический кросс';
        case 'node': return 'Узел сети';
        default: return 'Объект';
    }
}

// Получить количество жил для типа кабеля
function getFiberCount(cableType) {
    switch(cableType) {
        case 'fiber4': return 4;
        case 'fiber8': return 8;
        case 'fiber16': return 16;
        case 'fiber24': return 24;
        case 'copper': return 4;
        default: return 4;
    }
}

// Получить цвет кабеля
function getCableColor(type) {
    switch(type) {
        case 'fiber4': return '#e74c3c';
        case 'fiber8': return '#f39c12';
        case 'fiber16': return '#9b59b6';
        case 'fiber24': return '#1abc9c';
        case 'copper': return '#95a5a6';
        default: return '#3498db';
    }
}

// Получить толщину кабеля
function getCableWidth(type) {
    switch(type) {
        case 'fiber4': return 3;
        case 'fiber8': return 4;
        case 'fiber16': return 5;
        case 'fiber24': return 6;
        case 'copper': return 4;
        default: return 3;
    }
}

// Получить описание кабеля
function getCableDescription(type) {
    switch(type) {
        case 'fiber4': return 'ВОЛС 4 жилы';
        case 'fiber8': return 'ВОЛС 8 жил';
        case 'fiber16': return 'ВОЛС 16 жил';
        case 'fiber24': return 'ВОЛС 24 жилы';
        case 'copper': return 'Медный кабель';
        default: return 'Кабель';
    }
}

// Получить цвета жил для типа кабеля
function getFiberColors(cableType) {
    const colors = {
        'fiber4': [
            { number: 1, color: '#2196F3', name: 'Синий' },
            { number: 2, color: '#FF9800', name: 'Оранжевый' },
            { number: 3, color: '#4CAF50', name: 'Зелёный' },
            { number: 4, color: '#795548', name: 'Коричневый' }
        ],
        'fiber8': [
            { number: 1, color: '#2196F3', name: 'Синий' },
            { number: 2, color: '#FF9800', name: 'Оранжевый' },
            { number: 3, color: '#4CAF50', name: 'Зелёный' },
            { number: 4, color: '#795548', name: 'Коричневый' },
            { number: 5, color: '#9E9E9E', name: 'Серый' },
            { number: 6, color: '#FFFFFF', name: 'Белый' },
            { number: 7, color: '#F44336', name: 'Красный' },
            { number: 8, color: '#000000', name: 'Чёрный' }
        ],
        'fiber16': [
            { number: 1, color: '#2196F3', name: 'Синий' },
            { number: 2, color: '#FF9800', name: 'Оранжевый' },
            { number: 3, color: '#4CAF50', name: 'Зелёный' },
            { number: 4, color: '#795548', name: 'Коричневый' },
            { number: 5, color: '#9E9E9E', name: 'Серый' },
            { number: 6, color: '#FFFFFF', name: 'Белый' },
            { number: 7, color: '#F44336', name: 'Красный' },
            { number: 8, color: '#000000', name: 'Чёрный' },
            { number: 9, color: '#FFEB3B', name: 'Жёлтый' },
            { number: 10, color: '#9C27B0', name: 'Фиолетовый' },
            { number: 11, color: '#E91E63', name: 'Розовый' },
            { number: 12, color: '#00BCD4', name: 'Голубой' },
            { number: 13, color: '#8BC34A', name: 'Салатовый' },
            { number: 14, color: '#FF5722', name: 'Тёмно-оранж.' },
            { number: 15, color: '#607D8B', name: 'Сине-серый' },
            { number: 16, color: '#CDDC39', name: 'Лайм' }
        ],
        'fiber24': [
            { number: 1, color: '#2196F3', name: 'Синий' },
            { number: 2, color: '#FF9800', name: 'Оранжевый' },
            { number: 3, color: '#4CAF50', name: 'Зелёный' },
            { number: 4, color: '#795548', name: 'Коричневый' },
            { number: 5, color: '#9E9E9E', name: 'Серый' },
            { number: 6, color: '#FFFFFF', name: 'Белый' },
            { number: 7, color: '#F44336', name: 'Красный' },
            { number: 8, color: '#000000', name: 'Чёрный' },
            { number: 9, color: '#FFEB3B', name: 'Жёлтый' },
            { number: 10, color: '#9C27B0', name: 'Фиолетовый' },
            { number: 11, color: '#E91E63', name: 'Розовый' },
            { number: 12, color: '#00BCD4', name: 'Голубой' },
            { number: 13, color: '#8BC34A', name: 'Салатовый' },
            { number: 14, color: '#FF5722', name: 'Тёмно-оранж.' },
            { number: 15, color: '#607D8B', name: 'Сине-серый' },
            { number: 16, color: '#CDDC39', name: 'Лайм' },
            { number: 17, color: '#3F51B5', name: 'Индиго' },
            { number: 18, color: '#009688', name: 'Бирюзовый' },
            { number: 19, color: '#FFC107', name: 'Янтарь' },
            { number: 20, color: '#673AB7', name: 'Пурпурный' },
            { number: 21, color: '#03A9F4', name: 'Светло-синий' },
            { number: 22, color: '#FFCDD2', name: 'Светло-красный' },
            { number: 23, color: '#C8E6C9', name: 'Светло-зелёный' },
            { number: 24, color: '#D7CCC8', name: 'Светло-корич.' }
        ],
        'copper': [
            { number: 1, color: '#FF9800', name: 'Оранжевый' },
            { number: 2, color: '#4CAF50', name: 'Зелёный' },
            { number: 3, color: '#2196F3', name: 'Синий' },
            { number: 4, color: '#795548', name: 'Коричневый' }
        ]
    };
    
    return colors[cableType] || colors['fiber4'];
}

// Экспорт функций
window.Utils = {
    generateUniqueId,
    getObjectUniqueId,
    escapeHtml,
    calculateDistance,
    pointToLineDistance,
    getObjectTypeName,
    getFiberCount,
    getCableColor,
    getCableWidth,
    getCableDescription,
    getFiberColors
};
