// ==================== Трассировка жил ====================

// Трассировка жилы начиная с указанного объекта (кросса или муфты)
function traceFiberPathFromObject(startObject, startCableId, startFiberNumber) {
    const path = [];
    const visitedFibers = new Set();
    const visitedObjects = new Set();
    
    // Находим кабель по ID
    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }
    
    // Находит соединение жил в муфте/кроссе
    function findFiberConnection(cableId, fiberNumber, sleeveObj) {
        const connections = sleeveObj.properties.get('fiberConnections') || [];
        
        for (const conn of connections) {
            if (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) {
                return { cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber };
            }
            if (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) {
                return { cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber };
            }
        }
        return null;
    }
    
    // Находим другой конец кабеля
    function getOtherEnd(cable, currentObj) {
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        
        if (!fromObj || !toObj) return null;
        
        if (fromObj === currentObj) {
            return toObj;
        } else if (toObj === currentObj) {
            return fromObj;
        }
        
        const currentId = getObjectUniqueId(currentObj);
        const fromId = getObjectUniqueId(fromObj);
        const toId = getObjectUniqueId(toObj);
        
        if (fromId === currentId) {
            return toObj;
        } else if (toId === currentId) {
            return fromObj;
        }
        
        const currentCoords = currentObj.geometry ? currentObj.geometry.getCoordinates() : null;
        const fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
        const toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
        
        if (currentCoords && fromCoords && 
            Math.abs(currentCoords[0] - fromCoords[0]) < 0.0001 && 
            Math.abs(currentCoords[1] - fromCoords[1]) < 0.0001) {
            return toObj;
        } else if (currentCoords && toCoords && 
            Math.abs(currentCoords[0] - toCoords[0]) < 0.0001 && 
            Math.abs(currentCoords[1] - toCoords[1]) < 0.0001) {
            return fromObj;
        }
        
        return null;
    }
    
    // Вспомогательная функция для поиска следующего кабеля через объект
    function findNextCableThroughObject(obj, excludeCable) {
        const objCoords = obj.geometry ? obj.geometry.getCoordinates() : null;
        const objId = getObjectUniqueId(obj);
        const excludeId = excludeCable ? excludeCable.properties.get('uniqueId') : null;
        
        for (const cable of objects) {
            if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
            
            const cableId = cable.properties.get('uniqueId');
            if (excludeId && cableId === excludeId) continue;
            
            const fromObj = cable.properties.get('from');
            const toObj = cable.properties.get('to');
            
            if (!fromObj || !toObj) continue;
            
            if (fromObj === obj || toObj === obj) {
                return cable;
            }
            
            const fromId = getObjectUniqueId(fromObj);
            const toId = getObjectUniqueId(toObj);
            
            if (objId && (fromId === objId || toId === objId)) {
                return cable;
            }
            
            if (objCoords) {
                const fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
                const toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
                
                if (fromCoords && Math.abs(fromCoords[0] - objCoords[0]) < 0.0001 && Math.abs(fromCoords[1] - objCoords[1]) < 0.0001) {
                    return cable;
                }
                if (toCoords && Math.abs(toCoords[0] - objCoords[0]) < 0.0001 && Math.abs(toCoords[1] - objCoords[1]) < 0.0001) {
                    return cable;
                }
            }
        }
        
        return null;
    }
    
    // Находим начальный кабель
    const startCable = findCableById(startCableId);
    if (!startCable) return { path: [], error: 'Кабель не найден' };
    
    const startObjectId = getObjectUniqueId(startObject);
    const startObjType = startObject.properties.get('type');
    const startObjName = startObject.properties.get('name') || getObjectTypeName(startObjType);
    
    // Добавляем начальный объект (кросс или муфта)
    path.push({
        type: 'start',
        objectType: startObjType,
        objectName: startObjName,
        object: startObject
    });
    
    visitedObjects.add(startObjectId);
    
    // Текущее состояние трассировки
    let currentCableId = startCableId;
    let currentFiberNumber = startFiberNumber;
    let currentCable = startCable;
    let currentObject = startObject;
    
    const maxIterations = 100;
    let iterations = 0;
    
    while (iterations < maxIterations) {
        iterations++;
        
        // Добавляем текущий кабель в путь
        const cableName = currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType'));
        path.push({
            type: 'cable',
            cableId: currentCableId,
            cableName: cableName,
            fiberNumber: currentFiberNumber,
            cable: currentCable
        });
        
        // Находим следующий объект (другой конец кабеля)
        const nextObject = getOtherEnd(currentCable, currentObject);
        
        if (!nextObject) break;
        
        const nextObjectId = getObjectUniqueId(nextObject);
        
        if (visitedObjects.has(nextObjectId)) break;
        visitedObjects.add(nextObjectId);
        
        const objType = nextObject.properties.get('type');
        const objName = nextObject.properties.get('name') || getObjectTypeName(objType);
        
        path.push({
            type: 'object',
            objectType: objType,
            objectName: objName,
            object: nextObject
        });
        
        if (objType === 'sleeve' || objType === 'cross') {
            if (objType === 'cross') {
                const nodeConnections = nextObject.properties.get('nodeConnections') || {};
                const nodeConnKey = `${currentCableId}-${currentFiberNumber}`;
                const nodeConn = nodeConnections[nodeConnKey];
                
                if (nodeConn) {
                    const connectedNode = objects.find(obj => 
                        obj.properties && 
                        obj.properties.get('type') === 'node' &&
                        obj.properties.get('uniqueId') === nodeConn.nodeId
                    );
                    
                    if (connectedNode) {
                        path.push({
                            type: 'nodeConnection',
                            cableId: currentCableId,
                            fiberNumber: currentFiberNumber,
                            nodeName: nodeConn.nodeName,
                            cross: nextObject
                        });
                        
                        path.push({
                            type: 'object',
                            objectType: 'node',
                            objectName: connectedNode.properties.get('name') || 'Узел сети',
                            object: connectedNode
                        });
                    }
                    break;
                }
            }
            
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);
            
            const nextFiber = findFiberConnection(currentCableId, currentFiberNumber, nextObject);
            
            if (!nextFiber) {
                break;
            }
            
            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;
            
            const fiberLabels = nextObject.properties.get('fiberLabels') || {};
            const fromLabel = fiberLabels[`${currentCableId}-${currentFiberNumber}`] || '';
            const toLabel = fiberLabels[`${nextFiber.cableId}-${nextFiber.fiberNumber}`] || '';
            
            path.push({
                type: 'connection',
                fromCableId: currentCableId,
                fromFiberNumber: currentFiberNumber,
                fromLabel: fromLabel,
                toCableId: nextFiber.cableId,
                toFiberNumber: nextFiber.fiberNumber,
                toLabel: toLabel,
                sleeve: nextObject
            });
            
            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;
            currentObject = nextObject;
            
        } else if (objType === 'support') {
            const nextCableForSupport = findNextCableThroughObject(nextObject, currentCable);
            
            if (!nextCableForSupport) {
                break;
            }
            
            currentCable = nextCableForSupport;
            currentCableId = nextCableForSupport.properties.get('uniqueId');
            currentObject = nextObject;
            
        } else {
            break;
        }
    }
    
    return { path, error: null };
}

// Трассировка от узла сети
function traceFromNode(crossUniqueId, cableId, fiberNumber) {
    const crossObj = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cross' &&
        obj.properties.get('uniqueId') === crossUniqueId
    );
    
    if (!crossObj) {
        alert('Кросс не найден');
        return;
    }
    
    const nodeConnections = crossObj.properties.get('nodeConnections') || {};
    const key = `${cableId}-${fiberNumber}`;
    const nodeConn = nodeConnections[key];
    
    let nodeObj = null;
    if (nodeConn) {
        nodeObj = objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'node' &&
            obj.properties.get('uniqueId') === nodeConn.nodeId
        );
    }
    
    showFiberTraceFromCross(crossObj, cableId, fiberNumber, nodeObj);
}

// Показывает трассировку начиная от кросса
function showFiberTraceFromCross(startCrossObj, cableId, fiberNumber, startNodeObj = null) {
    const result = traceFiberPathFromObject(startCrossObj, cableId, fiberNumber);
    
    if (result.error) {
        alert(`Ошибка трассировки: ${result.error}`);
        return;
    }
    
    if (result.path.length === 0) {
        alert('Путь не найден');
        return;
    }
    
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('modalTitle');
    const content = document.getElementById('modalInfo');
    
    title.textContent = `🔍 Трассировка жилы ${fiberNumber}`;
    
    let html = '<div class="trace-path" style="padding: 10px;">';
    html += '<h4 style="margin: 0 0 16px 0; color: #1e40af; font-size: 1rem; font-weight: 600;">📍 Путь жилы:</h4>';
    
    let stepNumber = 1;
    if (startNodeObj) {
        const nodeName = startNodeObj.properties.get('name') || 'Узел сети';
        html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="width: 32px; height: 32px; background: #22c55e; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">🖥️</span>
            <div style="margin-left: 12px; padding: 10px 14px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0; flex: 1;">
                <span style="font-weight: 600; color: #166534;">🖥️ ${escapeHtml(nodeName)}</span>
                <span style="color: #6b7280; font-size: 0.8rem;"> (Узел сети - начало трассы)</span>
            </div>
        </div>`;
        
        html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="width: 32px; height: 32px; background: #8b5cf6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">🔌</span>
            <div style="margin-left: 12px; padding: 10px 14px; background: #f5f3ff; border-radius: 6px; border: 1px solid #ddd6fe; flex: 1;">
                <span style="color: #7c3aed;">Подключение к кроссу через жилу ${fiberNumber}</span>
            </div>
        </div>`;
        stepNumber++;
    }
    
    result.path.forEach((item, index) => {
        if (item.type === 'start') {
            const icon = item.objectType === 'cross' ? '📦' : (item.objectType === 'sleeve' ? '🔴' : '📍');
            html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="width: 32px; height: 32px; background: #22c55e; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">${stepNumber}</span>
                <div style="margin-left: 12px; padding: 10px 14px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0; flex: 1;">
                    <span style="font-weight: 600; color: #166534;">${icon} ${escapeHtml(item.objectName)}</span>
                    <span style="color: #6b7280; font-size: 0.8rem;"> (${getObjectTypeName(item.objectType)})</span>
                </div>
            </div>`;
            stepNumber++;
        } else if (item.type === 'cable') {
            html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="width: 32px; height: 32px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">➡</span>
                <div style="margin-left: 12px; padding: 10px 14px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; flex: 1;">
                    <span style="color: #1e40af;">📡 ${escapeHtml(item.cableName)}</span>
                    <span style="background: #dbeafe; padding: 2px 8px; border-radius: 4px; font-weight: 600; color: #1e40af; margin-left: 8px;">Жила ${item.fiberNumber}</span>
                </div>
            </div>`;
        } else if (item.type === 'connection') {
            const fromLabelText = item.fromLabel ? ` (${escapeHtml(item.fromLabel)})` : '';
            const toLabelText = item.toLabel ? ` (${escapeHtml(item.toLabel)})` : '';
            html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="width: 32px; height: 32px; background: #f59e0b; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">⚡</span>
                <div style="margin-left: 12px; padding: 10px 14px; background: #fffbeb; border-radius: 6px; border: 1px solid #fde68a; flex: 1;">
                    <span style="color: #92400e;">🔗 Соединение: Жила ${item.fromFiberNumber}${fromLabelText} → Жила ${item.toFiberNumber}${toLabelText}</span>
                </div>
            </div>`;
        } else if (item.type === 'nodeConnection') {
            html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="width: 32px; height: 32px; background: #8b5cf6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">🔌</span>
                <div style="margin-left: 12px; padding: 10px 14px; background: #f5f3ff; border-radius: 6px; border: 1px solid #ddd6fe; flex: 1;">
                    <span style="color: #7c3aed;">🔌 Вывод на узел: Жила ${item.fiberNumber} → ${escapeHtml(item.nodeName)}</span>
                </div>
            </div>`;
        } else if (item.type === 'object') {
            const bgColor = item.objectType === 'sleeve' ? '#fef2f2' : (item.objectType === 'cross' ? '#f5f3ff' : (item.objectType === 'node' ? '#f0fdf4' : '#f8fafc'));
            const borderColor = item.objectType === 'sleeve' ? '#fecaca' : (item.objectType === 'cross' ? '#ddd6fe' : (item.objectType === 'node' ? '#bbf7d0' : '#e2e8f0'));
            const textColor = item.objectType === 'sleeve' ? '#dc2626' : (item.objectType === 'cross' ? '#7c3aed' : (item.objectType === 'node' ? '#166534' : '#475569'));
            const icon = item.objectType === 'sleeve' ? '🔴' : (item.objectType === 'cross' ? '📦' : (item.objectType === 'node' ? '🖥️' : '📍'));
            
            html += `<div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="width: 32px; height: 32px; background: ${textColor}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.875rem; flex-shrink: 0;">${stepNumber}</span>
                <div style="margin-left: 12px; padding: 10px 14px; background: ${bgColor}; border-radius: 6px; border: 1px solid ${borderColor}; flex: 1;">
                    <span style="font-weight: 600; color: ${textColor};">${icon} ${escapeHtml(item.objectName)}</span>
                    <span style="color: #6b7280; font-size: 0.8rem;"> (${getObjectTypeName(item.objectType)})</span>
                </div>
            </div>`;
            stepNumber++;
        }
    });
    
    html += '</div>';
    
    const sleevesCount = result.path.filter(p => p.type === 'object' && p.objectType === 'sleeve').length;
    const crossesCount = result.path.filter(p => p.type === 'object' && p.objectType === 'cross').length;
    const cablesCount = result.path.filter(p => p.type === 'cable').length;
    const connectionsCount = result.path.filter(p => p.type === 'connection').length;
    
    html += `<div style="margin-top: 16px; padding: 12px; background: #f1f5f9; border-radius: 6px; border: 1px solid #e2e8f0;">
        <div style="font-weight: 600; color: #334155; margin-bottom: 8px;">📊 Статистика трассы:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.875rem; color: #64748b;">
            <span>📡 Кабелей: ${cablesCount}</span>
            <span>🔴 Муфт: ${sleevesCount}</span>
            <span>📦 Кроссов: ${crossesCount}</span>
            <span>🔗 Соединений: ${connectionsCount}</span>
        </div>
    </div>`;
    
    content.innerHTML = html;
    modal.style.display = 'block';
}

// Получает все жилы, подключенные к узлу
function getNodeConnectedFibers(nodeUniqueId) {
    const connectedFibers = [];
    
    if (!nodeUniqueId) return connectedFibers;
    
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cross') {
            const nodeConnections = obj.properties.get('nodeConnections');
            const fiberLabels = obj.properties.get('fiberLabels') || {};
            const crossName = obj.properties.get('name') || 'Кросс без имени';
            const crossUniqueId = obj.properties.get('uniqueId');
            
            if (nodeConnections) {
                Object.keys(nodeConnections).forEach(key => {
                    const conn = nodeConnections[key];
                    if (conn.nodeId === nodeUniqueId) {
                        const parts = key.split('-');
                        const fiberNumber = parseInt(parts.pop());
                        const cableId = parts.join('-');
                        
                        connectedFibers.push({
                            crossObj: obj,
                            crossName: crossName,
                            crossUniqueId: crossUniqueId,
                            cableId: cableId,
                            fiberNumber: fiberNumber,
                            fiberLabel: fiberLabels[key] || ''
                        });
                    }
                });
            }
        }
    });
    
    return connectedFibers;
}

// Экспорт функций
window.Tracing = {
    traceFiberPathFromObject,
    traceFromNode,
    showFiberTraceFromCross,
    getNodeConnectedFibers
};
