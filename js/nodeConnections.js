// ==================== Соединения кросс-узел ====================

// Переменные для модального окна выбора узла
let nodeSelectionModalData = null;

// Получает список доступных узлов для подключения
function getAvailableNodes() {
    return objects.filter(obj => 
        obj.properties && obj.properties.get('type') === 'node'
    );
}

// Показывает диалог выбора узла для подключения жилы
function showNodeSelectionDialog(crossObj, cableId, fiberNumber) {
    const nodes = getAvailableNodes();
    
    if (nodes.length === 0) {
        alert('Нет доступных узлов для подключения. Сначала создайте узел сети.');
        return;
    }
    
    // Сохраняем данные для использования при выборе
    nodeSelectionModalData = {
        crossObj: crossObj,
        cableId: cableId,
        fiberNumber: fiberNumber,
        nodes: nodes
    };
    
    // Показываем модальное окно
    const modal = document.getElementById('nodeSelectionModal');
    const fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    const searchInput = document.getElementById('nodeSearchInput');
    const nodeListContainer = document.getElementById('nodeListContainer');
    
    // Устанавливаем информацию о жиле
    fiberInfo.textContent = `Подключение жилы #${fiberNumber} к узлу сети`;
    
    // Очищаем поле поиска
    searchInput.value = '';
    
    // Рендерим список узлов
    renderNodeList(nodes, '');
    
    // Показываем модальное окно
    modal.style.display = 'block';
    
    // Фокус на поле поиска
    setTimeout(() => searchInput.focus(), 100);
}

// Рендерит список узлов с учётом фильтра поиска
function renderNodeList(nodes, searchQuery) {
    const nodeListContainer = document.getElementById('nodeListContainer');
    
    if (nodes.length === 0) {
        nodeListContainer.innerHTML = `
            <div class="node-list-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Нет доступных узлов</p>
            </div>
        `;
        return;
    }
    
    // Фильтруем узлы по поисковому запросу
    const query = searchQuery.toLowerCase().trim();
    const filteredNodes = query 
        ? nodes.filter(node => {
            const name = (node.properties.get('name') || 'Узел без имени').toLowerCase();
            return name.includes(query);
        })
        : nodes;
    
    if (filteredNodes.length === 0) {
        nodeListContainer.innerHTML = `
            <div class="node-list-no-results">
                Узлы не найдены по запросу "${searchQuery}"
            </div>
        `;
        return;
    }
    
    // Генерируем HTML для списка
    let html = '';
    filteredNodes.forEach((node, index) => {
        const name = node.properties.get('name') || 'Узел без имени';
        const coords = node.geometry.getCoordinates();
        const coordsStr = `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
        const nodeIndex = nodes.indexOf(node);
        
        // Подсвечиваем найденный текст
        let displayName = name;
        if (query) {
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            displayName = name.replace(regex, '<mark>$1</mark>');
        }
        
        html += `
            <div class="node-list-item" data-node-index="${nodeIndex}" onclick="selectNodeFromList(${nodeIndex})">
                <div class="node-list-item-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                        <line x1="6" y1="6" x2="6.01" y2="6"></line>
                        <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                </div>
                <div class="node-list-item-info">
                    <div class="node-list-item-name">${displayName}</div>
                    <div class="node-list-item-coords">${coordsStr}</div>
                </div>
            </div>
        `;
    });
    
    nodeListContainer.innerHTML = html;
}

// Экранирование специальных символов для регулярного выражения
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Выбор узла из списка (глобальная функция для onclick)
window.selectNodeFromList = function(nodeIndex) {
    if (!nodeSelectionModalData) return;
    
    const { crossObj, cableId, fiberNumber, nodes } = nodeSelectionModalData;
    
    if (nodeIndex >= 0 && nodeIndex < nodes.length) {
        // Закрываем модальное окно
        closeNodeSelectionModal();
        
        // Подключаем жилу к выбранному узлу
        connectFiberToNode(crossObj, cableId, fiberNumber, nodes[nodeIndex]);
    }
}

// Закрытие модального окна выбора узла
function closeNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    modal.style.display = 'none';
    nodeSelectionModalData = null;
}

// Инициализация обработчиков для модального окна выбора узла
function initNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    const closeBtn = modal.querySelector('.close-node-selection');
    const cancelBtn = document.getElementById('cancelNodeSelection');
    const searchInput = document.getElementById('nodeSearchInput');
    
    // Закрытие по кнопке X
    closeBtn.addEventListener('click', closeNodeSelectionModal);
    
    // Закрытие по кнопке "Отмена"
    cancelBtn.addEventListener('click', closeNodeSelectionModal);
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeNodeSelectionModal();
        }
    });
    
    // Поиск узлов
    searchInput.addEventListener('input', function() {
        if (nodeSelectionModalData) {
            renderNodeList(nodeSelectionModalData.nodes, this.value);
        }
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeNodeSelectionModal();
        }
    });
}

// Инициализируем при загрузке страницы
document.addEventListener('DOMContentLoaded', initNodeSelectionModal);

// Подключает жилу кросса к узлу
function connectFiberToNode(crossObj, cableId, fiberNumber, nodeObj) {
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) {
        nodeConnections = {};
    }
    
    const key = `${cableId}-${fiberNumber}`;
    const nodeUniqueId = nodeObj.properties.get('uniqueId') || generateUniqueId('node');
    const crossUniqueId = crossObj.properties.get('uniqueId') || generateUniqueId('cross');
    
    if (!nodeObj.properties.get('uniqueId')) {
        nodeObj.properties.set('uniqueId', nodeUniqueId);
    }
    if (!crossObj.properties.get('uniqueId')) {
        crossObj.properties.set('uniqueId', crossUniqueId);
    }
    
    nodeConnections[key] = {
        nodeId: nodeUniqueId,
        nodeName: nodeObj.properties.get('name') || 'Узел'
    };
    
    crossObj.properties.set('nodeConnections', nodeConnections);
    
    createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber);
    
    saveData();
    
    showObjectInfo(crossObj);
}

// Отключает жилу от узла
function disconnectFiberFromNode(crossObj, cableId, fiberNumber) {
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) return;
    
    const key = `${cableId}-${fiberNumber}`;
    
    removeNodeConnectionLine(crossObj, cableId, fiberNumber);
    
    delete nodeConnections[key];
    crossObj.properties.set('nodeConnections', nodeConnections);
    
    saveData();
    
    showObjectInfo(crossObj);
}

// Создаёт визуальную линию соединения кросс-узел
function createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber) {
    const crossCoords = crossObj.geometry.getCoordinates();
    const nodeCoords = nodeObj.geometry.getCoordinates();
    
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;
    
    removeNodeConnectionLineByKey(key);
    
    const line = new ymaps.Polyline([crossCoords, nodeCoords], {
        hintContent: `Жила ${fiberNumber} → ${nodeObj.properties.get('name') || 'Узел'}`,
        balloonContent: `<strong>Соединение кросс-узел</strong><br>Жила ${fiberNumber}<br>→ ${nodeObj.properties.get('name') || 'Узел'}`
    }, {
        strokeColor: '#22c55e',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    
    line.properties.set('type', 'nodeConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('crossId', crossUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    
    nodeConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

// Удаляет визуальную линию соединения кросс-узел
function removeNodeConnectionLine(crossObj, cableId, fiberNumber) {
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;
    removeNodeConnectionLineByKey(key);
}

// Удаляет линию по ключу
function removeNodeConnectionLineByKey(key) {
    const lineIndex = nodeConnectionLines.findIndex(line => 
        line.properties.get('connectionKey') === key
    );
    
    if (lineIndex !== -1) {
        myMap.geoObjects.remove(nodeConnectionLines[lineIndex]);
        nodeConnectionLines.splice(lineIndex, 1);
    }
}

// Обновляет все визуальные линии соединений кросс-узел
function updateAllNodeConnectionLines() {
    nodeConnectionLines.forEach(line => {
        myMap.geoObjects.remove(line);
    });
    nodeConnectionLines = [];
    
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cross') {
            const nodeConnections = obj.properties.get('nodeConnections');
            if (nodeConnections) {
                Object.keys(nodeConnections).forEach(key => {
                    const conn = nodeConnections[key];
                    
                    const nodeObj = objects.find(n => 
                        n.properties && 
                        n.properties.get('type') === 'node' &&
                        n.properties.get('uniqueId') === conn.nodeId
                    );
                    
                    if (nodeObj) {
                        const parts = key.split('-');
                        const fiberNumberParsed = parseInt(parts.pop());
                        const cableIdParsed = parts.join('-');
                        
                        createNodeConnectionLine(obj, nodeObj, cableIdParsed, fiberNumberParsed);
                    }
                });
            }
        }
    });
}

// Экспорт функций
window.NodeConnections = {
    getAvailableNodes,
    showNodeSelectionDialog,
    connectFiberToNode,
    disconnectFiberFromNode,
    createNodeConnectionLine,
    removeNodeConnectionLine,
    removeNodeConnectionLineByKey,
    updateAllNodeConnectionLines,
    closeNodeSelectionModal,
    selectNodeFromList,
    initNodeSelectionModal
};
