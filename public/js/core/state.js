/**
 * Глобальное состояние приложения.
 * Загружается первым среди модулей main.
 */
var myMap;
var objects = [];
var selectedObjects = [];
var isEditMode = false;
var currentModalObject = null;
var hoveredObject = null;
var hoveredObjectOriginalIcon = null;
var hoverCircle = null;
var cursorIndicator = null;
var phantomPlacemark = null;
var placementCoordsPreviewPlacemark = null;
var currentCableTool = false;
var cableSource = null;
/** При прокладке меди: если начало маршрута — узел, id коммутатора из attachedSwitches */
var cableSourceCopperSwitchId = null;
/** После «Подключить» с порта: первый конец и порт задаются заранее; сбрасывается после создания кабеля или выхода из режима */
var pendingCopperPortPreset = null;
/** Ожидание выбора порта на конце медного кабеля (маршрут уже задан) */
var pendingCopperRouteFinish = null;
/** Прокладка меди только с портов коммутатора/кросса (не из списка типа кабеля) */
var copperCableLayingActive = false;
/** Прокладка одножильного feeder с PON-порта OLT в муфту/кросс */
var pendingOltPortPreset = null;
var pendingOltPortLayFiberBackup = null;
var oltPortCableJustFinished = false;
var cableWaypoints = [];
/** Подземный участок: вход в колодец — клики по карте — выход во второй колодец */
var cableUndergroundActive = false;
var cableUndergroundManhole = null;
var cableUndergroundCoords = [];
/** Завершённые подземные участки текущей цепочки прокладки */
var cableUndergroundPendingSpans = [];
/** Редактирование pathCoords уже проложенного подземного участка */
var cableUndergroundEditMode = false;
var cableUndergroundEditCable = null;
var cableUndergroundEditSpanIndex = -1;
var cableUndergroundEditPreviewLine = null;
/** pathCoords до перепрокладки (для отмены) */
var cableUndergroundRelayoutBackup = null;
var cablePreviewLine = null;
var selectedFiberForConnection = null;
/** Индекс выбранного сращивания для редактирования подписи (карточка кросса/муфты) */
var selectedFiberConnectionIndex = null;
var splitterFiberRoutingMode = false;
var splitterFiberRoutingData = null;
var splitterFiberWaypoints = [];
var splitterFiberPreviewLine = null;
var radioBridgeRoutingMode = false;
var radioBridgeRoutingData = null;
var radioBridgeWaypoints = [];
var radioBridgePreviewLine = null;
var fiberRoutingMode = false;
var fiberRoutingData = null;
var fiberRoutingWaypoints = [];
var fiberRoutingPreviewLine = null;
/** Разрез ВОЛС: установка муфты на линии кабеля или на опоре */
var cableSplitMode = false;
var cableSplitData = null;
var cableSplitPreviewLine = null;
/** Блокирует showCableInfo сразу после клика в режиме установки муфты (двойное срабатывание карта + линия). */
var cableSplitSuppressInfoUntil = 0;
/** Рисование региона: вершины полигона и preview */
var regionDrawMode = false;
var regionDrawCoords = [];
var regionDrawPreview = null;
/** Регион, у которого перерисовывают контур (null — создание нового) */
var regionEditTarget = null;
var regionEditGeometryBackup = null;
var currentUser = null;
var crossGroupPlacemarks = [];
var nodeGroupPlacemarks = [];
var crossGroupPlacemarkByKey = new Map();
var nodeGroupPlacemarkByKey = new Map();
var crossGroupNames = new Map();
var nodeGroupNames = new Map();
var collaboratorCursorsPlacemarks = [];
var mapFilter = { node: true, nodeAggregationOnly: false, cross: true, sleeve: true, support: true, attachment: true, manhole: true, olt: true, splitter: true, onu: true, camera: true };
var lastDraggedPlacemark = null;
var UNDO_MAX = 20;
var undoStack = [];
var redoStack = [];
var lastSavedState = null;
var inUndoRedo = false;
var showOnMapHighlightState = null;
var gponRoutingHighlightMarkers = [];
var gponRoutingHighlightIconState = [];
var gponRoutingHighlightAnimState = null;
