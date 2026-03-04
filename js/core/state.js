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
var currentCableTool = false;
var cableSource = null;
var cableWaypoints = [];
var cablePreviewLine = null;
var selectedFiberForConnection = null;
var splitterFiberRoutingMode = false;
var splitterFiberRoutingData = null;
var splitterFiberWaypoints = [];
var splitterFiberPreviewLine = null;
var fiberRoutingMode = false;
var fiberRoutingData = null;
var fiberRoutingWaypoints = [];
var fiberRoutingPreviewLine = null;
var netboxConfig = { url: '', token: '', ignoreSSL: false };
var netboxDevices = [];
var currentUser = null;
var crossGroupPlacemarks = [];
var nodeGroupPlacemarks = [];
var crossGroupNames = new Map();
var nodeGroupNames = new Map();
var collaboratorCursorsPlacemarks = [];
var mapFilter = { node: true, nodeAggregationOnly: false, cross: true, sleeve: true, support: true, attachment: true, olt: true, splitter: true, onu: true };
var lastDraggedPlacemark = null;
var UNDO_MAX = 20;
var undoStack = [];
var redoStack = [];
var lastSavedState = null;
var inUndoRedo = false;
var showOnMapHighlightState = null;
