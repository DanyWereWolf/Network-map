// ==================== Сохранение и загрузка данных ====================

// Сохранение данных в localStorage
function saveData() {
    const data = objects.map(obj => {
        const props = obj.properties.getAll();
        const geometry = obj.geometry.getCoordinates();
        
        if (props.type === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');
            
            const fromIndex = objects.indexOf(fromObj);
            const toIndex = objects.indexOf(toObj);
            
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: fromIndex,
                to: toIndex,
                geometry: geometry
            };
            // Сохраняем uniqueId кабеля
            if (props.uniqueId) {
                result.uniqueId = props.uniqueId;
            }
            // Сохраняем расстояние кабеля
            if (props.distance !== undefined) {
                result.distance = props.distance;
            }
            // Сохраняем название кабеля
            if (props.cableName) {
                result.cableName = props.cableName;
            }
            return result;
        } else {
            const result = {
                type: props.type,
                name: props.name,
                geometry: geometry
            };
            // Сохраняем uniqueId объекта
            if (props.uniqueId) {
                result.uniqueId = props.uniqueId;
            }
            // Сохраняем информацию об использованных жилах
            if (props.usedFibers) {
                result.usedFibers = props.usedFibers;
            }
            // Сохраняем информацию о соединениях жил в муфте
            if (props.fiberConnections) {
                result.fiberConnections = props.fiberConnections;
            }
            // Сохраняем подписи жил
            if (props.fiberLabels) {
                result.fiberLabels = props.fiberLabels;
            }
            // Сохраняем настройки муфты
            if (props.type === 'sleeve') {
                if (props.sleeveType) {
                    result.sleeveType = props.sleeveType;
                }
                if (props.maxFibers !== undefined) {
                    result.maxFibers = props.maxFibers;
                }
            }
            // Сохраняем настройки кросса
            if (props.type === 'cross') {
                if (props.crossPorts) {
                    result.crossPorts = props.crossPorts;
                }
                if (props.nodeConnections) {
                    result.nodeConnections = props.nodeConnections;
                }
            }
            // Сохраняем информацию о NetBox
            if (props.netboxId) {
                result.netboxId = props.netboxId;
            }
            if (props.netboxUrl) {
                result.netboxUrl = props.netboxUrl;
            }
            if (props.netboxDeviceType) {
                result.netboxDeviceType = props.netboxDeviceType;
            }
            if (props.netboxSite) {
                result.netboxSite = props.netboxSite;
            }
            return result;
        }
    });
    
    localStorage.setItem('networkMapData', JSON.stringify(data));
}

// Загрузка данных из localStorage
function loadData() {
    const data = localStorage.getItem('networkMapData');
    if (data) {
        const parsedData = JSON.parse(data);
        importData(parsedData);
        ensureNodeLabelsVisible();
        updateAllNodeConnectionLines();
    }
}

// Убеждаемся что подписи узлов видимы
function ensureNodeLabelsVisible() {
    objects.forEach(obj => {
        if (obj.properties) {
            const type = obj.properties.get('type');
            if (type === 'node' || type === 'cross') {
                const name = obj.properties.get('name') || '';
                updateNodeLabel(obj, name);
            }
        }
    });
}

// Импорт данных
function importData(data) {
    clearMap();
    
    const objectRefs = [];
    data.forEach(item => {
        if (item.type !== 'cable') {
            const obj = createObjectFromData(item);
            objectRefs.push(obj);
        } else {
            objectRefs.push(null);
        }
    });
    
    data.forEach((item, index) => {
        if (item.type === 'cable' && 
            item.from !== undefined && 
            item.to !== undefined && 
            item.from < objectRefs.length && 
            item.to < objectRefs.length) {
            
            const fromObj = objectRefs[item.from];
            const toObj = objectRefs[item.to];
            if (fromObj && toObj) {
                addCable(fromObj, toObj, item.cableType, item.uniqueId);
                const cable = objects.find(obj => 
                    obj.properties && 
                    obj.properties.get('type') === 'cable' &&
                    obj.properties.get('uniqueId') === item.uniqueId
                );
                if (cable) {
                    if (item.distance !== undefined) {
                        cable.properties.set('distance', item.distance);
                    }
                    if (item.cableName) {
                        cable.properties.set('cableName', item.cableName);
                        const cableDesc = item.cableName || getCableDescription(item.cableType);
                        cable.properties.set('balloonContent', `<strong>${cableDesc}</strong><br>Жил: ${getFiberCount(item.cableType)}`);
                    }
                }
            }
        }
    });
    
    updateAllNodeConnectionLines();
}

// Экспорт данных в файл
function exportData() {
    const data = objects.map(obj => {
        const props = obj.properties.getAll();
        const geometry = obj.geometry.getCoordinates();
        
        if (props.type === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');
            
            const fromIndex = objects.indexOf(fromObj);
            const toIndex = objects.indexOf(toObj);
            
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: fromIndex,
                to: toIndex,
                geometry: geometry
            };
            if (props.uniqueId) {
                result.uniqueId = props.uniqueId;
            }
            if (props.distance !== undefined) {
                result.distance = props.distance;
            }
            if (props.cableName) {
                result.cableName = props.cableName;
            }
            return result;
        } else {
            const result = {
                type: props.type,
                name: props.name,
                geometry: geometry
            };
            if (props.uniqueId) {
                result.uniqueId = props.uniqueId;
            }
            if (props.usedFibers) {
                result.usedFibers = props.usedFibers;
            }
            if (props.fiberConnections) {
                result.fiberConnections = props.fiberConnections;
            }
            if (props.fiberLabels) {
                result.fiberLabels = props.fiberLabels;
            }
            if (props.type === 'sleeve') {
                if (props.sleeveType) {
                    result.sleeveType = props.sleeveType;
                }
                if (props.maxFibers !== undefined) {
                    result.maxFibers = props.maxFibers;
                }
            }
            if (props.type === 'cross') {
                if (props.crossPorts) {
                    result.crossPorts = props.crossPorts;
                }
                if (props.nodeConnections) {
                    result.nodeConnections = props.nodeConnections;
                }
            }
            if (props.netboxId) {
                result.netboxId = props.netboxId;
            }
            if (props.netboxUrl) {
                result.netboxUrl = props.netboxUrl;
            }
            if (props.netboxDeviceType) {
                result.netboxDeviceType = props.netboxDeviceType;
            }
            if (props.netboxSite) {
                result.netboxSite = props.netboxSite;
            }
            return result;
        }
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network-map-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Очистка карты
function clearMap() {
    myMap.geoObjects.removeAll();
    objects = [];
    selectedObjects = [];
    nodeConnectionLines = [];
    saveData();
    updateStats();
}

// Обновление статистики
function updateStats() {
    const nodeCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'node').length;
    const supportCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'support').length;
    const sleeveCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'sleeve').length;
    const crossCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cross').length;
    const cableCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cable').length;

    document.getElementById('nodeCount').textContent = nodeCount;
    document.getElementById('supportCount').textContent = supportCount;
    document.getElementById('sleeveCount').textContent = sleeveCount;
    document.getElementById('crossCount').textContent = crossCount;
    document.getElementById('cableCount').textContent = cableCount;
}

// Экспорт функций
window.DataManager = {
    saveData,
    loadData,
    importData,
    exportData,
    clearMap,
    updateStats,
    ensureNodeLabelsVisible
};
