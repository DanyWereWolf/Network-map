function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getObjectTypeName(type) {
    switch (type) {
        case 'support': return 'Опора связи';
        case 'sleeve': return 'Кабельная муфта';
        case 'cross': return 'Оптический кросс';
        case 'olt': return 'OLT (GPON)';
        case 'splitter': return 'Сплиттер';
        case 'onu': return 'ONU';
        case 'camera': return 'Камера';
        case 'mediaConverter': return 'Медиаконвертер';
        case 'node': return 'Узел сети';
        case 'switch': return 'Коммутатор';
        case 'attachment': return 'Крепление узлов';
        default: return 'Объект';
    }
}
