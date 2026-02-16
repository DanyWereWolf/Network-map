/**
 * Вспомогательные функции
 */

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
        case 'node': return 'Узел сети';
        case 'attachment': return 'Крепление узлов';
        case 'olt': return 'OLT';
        case 'splitter': return 'Сплиттер GPON';
        case 'onu': return 'ONU';
        default: return 'Объект';
    }
}
