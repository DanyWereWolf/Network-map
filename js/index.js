// ==================== Главный файл приложения ====================
// Этот файл инициализирует приложение и загружает все модули

document.addEventListener('DOMContentLoaded', function() {
    ymaps.ready(initApp);
});

function initApp() {
    // Инициализация карты
    myMap = new ymaps.Map('map', {
        center: [54.663609, 86.162243],
        zoom: 15
    });
    
    myMap.options.set('suppressMapOpenBlock', true);
    
    // Создаём индикатор под курсором
    createCursorIndicator();
    
    // Инициализируем переменные
    window.lastMouseX = 0;
    window.lastMouseY = 0;
    
    // Загружаем данные
    loadData();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    setupNetBoxEventListeners();
    setupAccordions();
    
    // Переключаемся в режим просмотра
    switchToViewMode();
    
    // Обновляем линии соединений
    setTimeout(() => {
        updateAllNodeConnectionLines();
    }, 500);
    
    console.log('Приложение инициализировано');
}

// ==================== Экспорт глобальных функций ====================
// Для совместимости с существующим кодом

window.saveData = saveData;
window.loadData = loadData;
window.exportData = exportData;
window.clearMap = clearMap;
window.updateStats = updateStats;

window.createObject = createObject;
window.deleteObject = deleteObject;
window.selectObject = selectObject;
window.deselectObject = deselectObject;
window.clearSelection = clearSelection;

window.addCable = addCable;
window.createCableFromPoints = createCableFromPoints;
window.deleteCableByUniqueId = deleteCableByUniqueId;

window.showObjectInfo = showObjectInfo;
window.showCableInfo = showCableInfo;

window.traceFiberPathFromObject = traceFiberPathFromObject;
window.traceFromNode = traceFromNode;
window.showFiberTraceFromCross = showFiberTraceFromCross;
window.getNodeConnectedFibers = getNodeConnectedFibers;

window.connectFiberToNode = connectFiberToNode;
window.disconnectFiberFromNode = disconnectFiberFromNode;
window.updateAllNodeConnectionLines = updateAllNodeConnectionLines;
window.showNodeSelectionDialog = showNodeSelectionDialog;

window.getObjectUniqueId = getObjectUniqueId;
window.generateUniqueId = generateUniqueId;
window.escapeHtml = escapeHtml;
window.getObjectTypeName = getObjectTypeName;
window.getCableDescription = getCableDescription;
window.getFiberCount = getFiberCount;
window.getFiberColors = getFiberColors;
window.getCableColor = getCableColor;
window.getCableWidth = getCableWidth;
window.calculateDistance = calculateDistance;
