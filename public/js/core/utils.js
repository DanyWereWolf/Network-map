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
        case 'radioBridge': return 'Wi‑Fi радиомост';
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

/** Подпись типа для счётчиков («9 Кроссов», «12 Колодцев»). */
function getObjectTypePluralLabel(type) {
    switch (type) {
        case 'support': return 'Опор';
        case 'sleeve': return 'Муфт';
        case 'spliceCassette': return 'Сплайс-кассет';
        case 'cross': return 'Кроссов';
        case 'node': return 'Узлов';
        case 'attachment': return 'Креплений';
        case 'manhole': return 'Колодцев';
        case 'signalPost': return 'Столбов';
        case 'cabinet': return 'Ящиков';
        case 'olt': return 'OLT';
        case 'splitter': return 'Сплиттеров';
        case 'onu': return 'ONU';
        case 'camera': return 'Камер';
        case 'mediaConverter': return 'Медиаконв.';
        case 'radioBridge': return 'Радиомостов';
        case 'switch': return 'Коммутаторов';
        case 'cable': return 'Кабелей';
        case 'region': return 'Регионов';
        default: return getObjectTypeName(type);
    }
}
