function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isCrossLikeHostType(type) {
    return type === 'cross';
}

function isSleeveLikeHostType(type) {
    return type === 'sleeve' || type === 'spliceCassette';
}

function isFiberHostType(type) {
    return isSleeveLikeHostType(type) || type === 'cross';
}

/** Конечные точки прокладки кабеля ВОЛС (муфта, сплайс-кассета, кросс, OLT). */
function isFiberCableEndpointType(type) {
    return isFiberHostType(type) || type === 'olt';
}

function getObjectTypeName(type) {
    switch (type) {
        case 'support': return 'Опора связи';
        case 'sleeve': return 'Кабельная муфта';
        case 'spliceCassette': return 'Сплайс-кассета';
        case 'cross': return 'Оптический кросс';
        case 'olt': return 'OLT (GPON)';
        case 'splitter': return 'Сплиттер';
        case 'onu': return 'ONU';
        case 'camera': return 'Камера';
        case 'mediaConverter': return 'Медиаконвертер';
        case 'node': return 'Узел сети';
        case 'switch': return 'Коммутатор';
        case 'attachment': return 'Крепление узлов';
        case 'manhole': return 'Колодец';
        case 'signalPost': return 'Сигнальный столб';
        case 'cabinet': return 'Ящик';
        case 'region': return 'Регион';
        default: return 'Объект';
    }
}
