// ==================== Соединения кросс-узел ====================

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
    
    let nodeList = 'Выберите узел для подключения жилы:\n\n';
    nodes.forEach((node, index) => {
        const name = node.properties.get('name') || 'Узел без имени';
        nodeList += `${index + 1}. ${name}\n`;
    });
    nodeList += '\nВведите номер узла (или 0 для отмены):';
    
    const choice = prompt(nodeList);
    if (choice === null || choice === '0' || choice === '') return;
    
    const nodeIndex = parseInt(choice) - 1;
    if (nodeIndex >= 0 && nodeIndex < nodes.length) {
        connectFiberToNode(crossObj, cableId, fiberNumber, nodes[nodeIndex]);
    }
}

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
    updateAllNodeConnectionLines
};
