// ==================== Глобальные переменные и конфигурация ====================

// Карта и объекты
let myMap;
let objects = [];
let selectedObjects = [];
let isEditMode = false;

// Модальные окна и UI
let currentModalObject = null;
let hoveredObject = null;
let hoveredObjectOriginalIcon = null;
let hoverCircle = null;
let cursorIndicator = null;
let phantomPlacemark = null;

// Режим прокладки кабеля
let currentCableTool = false;
let cableSource = null;
let cablePreviewLine = null;

// Соединение жил
let selectedFiberForConnection = null;

// Режим размещения объектов
let objectPlacementMode = false;
let currentPlacementType = null;

// Линии соединений кросс-узел
let nodeConnectionLines = [];

// Конфигурация NetBox
let netboxConfig = {
    url: '',
    token: '',
    ignoreSSL: false
};
let netboxDevices = [];

// Экспорт для использования в других модулях
window.AppState = {
    get myMap() { return myMap; },
    set myMap(val) { myMap = val; },
    get objects() { return objects; },
    set objects(val) { objects = val; },
    get selectedObjects() { return selectedObjects; },
    set selectedObjects(val) { selectedObjects = val; },
    get isEditMode() { return isEditMode; },
    set isEditMode(val) { isEditMode = val; },
    get currentModalObject() { return currentModalObject; },
    set currentModalObject(val) { currentModalObject = val; },
    get hoveredObject() { return hoveredObject; },
    set hoveredObject(val) { hoveredObject = val; },
    get hoveredObjectOriginalIcon() { return hoveredObjectOriginalIcon; },
    set hoveredObjectOriginalIcon(val) { hoveredObjectOriginalIcon = val; },
    get hoverCircle() { return hoverCircle; },
    set hoverCircle(val) { hoverCircle = val; },
    get cursorIndicator() { return cursorIndicator; },
    set cursorIndicator(val) { cursorIndicator = val; },
    get phantomPlacemark() { return phantomPlacemark; },
    set phantomPlacemark(val) { phantomPlacemark = val; },
    get currentCableTool() { return currentCableTool; },
    set currentCableTool(val) { currentCableTool = val; },
    get cableSource() { return cableSource; },
    set cableSource(val) { cableSource = val; },
    get cablePreviewLine() { return cablePreviewLine; },
    set cablePreviewLine(val) { cablePreviewLine = val; },
    get selectedFiberForConnection() { return selectedFiberForConnection; },
    set selectedFiberForConnection(val) { selectedFiberForConnection = val; },
    get objectPlacementMode() { return objectPlacementMode; },
    set objectPlacementMode(val) { objectPlacementMode = val; },
    get currentPlacementType() { return currentPlacementType; },
    set currentPlacementType(val) { currentPlacementType = val; },
    get nodeConnectionLines() { return nodeConnectionLines; },
    set nodeConnectionLines(val) { nodeConnectionLines = val; },
    get netboxConfig() { return netboxConfig; },
    set netboxConfig(val) { netboxConfig = val; },
    get netboxDevices() { return netboxDevices; },
    set netboxDevices(val) { netboxDevices = val; }
};
