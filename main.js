let myMap;
let objects = [];
let selectedObjects = [];
let isEditMode = false;
let currentModalObject = null; // Объект, информация о котором отображается в модальном окне
let hoveredObject = null; // Объект, на который наведена мышь
let hoveredObjectOriginalIcon = null; // Оригинальная иконка объекта для восстановления
let hoverCircle = null; // Круг, показывающий кликабельную зону
let cursorIndicator = null; // Индикатор под курсором
let phantomPlacemark = null; // Фантомный объект под курсором в режиме размещения
let currentCableTool = false; // Режим прокладки кабеля
let cableSource = null; // Начальная точка текущего кабеля
let cablePreviewLine = null; // Временная линия для предпросмотра кабеля
let selectedFiberForConnection = null; // Выбранная жила для создания соединения
let netboxConfig = {
    url: '',
    token: '',
    ignoreSSL: false
};
let netboxDevices = []; // Загруженные устройства из NetBox

document.addEventListener('DOMContentLoaded', function() {
    ymaps.ready(init);
});

function init() {
    myMap = new ymaps.Map('map', {
        center: [54.663609, 86.162243],
        zoom: 15
    });
    
    // Создаем индикатор под курсором
    createCursorIndicator();
    
    // Инициализируем переменные для отслеживания позиции мыши
    window.lastMouseX = 0;
    window.lastMouseY = 0;

    // Настройка стиля карты под тёмную тему
    myMap.options.set('suppressMapOpenBlock', true);
    
    loadData();
    setupEventListeners();
    switchToViewMode();
}

function setupEventListeners() {
    // Переключение режимов
    document.getElementById('viewMode').addEventListener('click', switchToViewMode);
    document.getElementById('editMode').addEventListener('click', switchToEditMode);
    

    // Добавление объектов
    // Обработчик для кнопки добавления объектов
    const addObjectBtn = document.getElementById('addObject');
    addObjectBtn.addEventListener('click', function(e) {
        // Если кнопка была переопределена (onclick установлен для отмены), вызываем его
        if (this.onclick && typeof this.onclick === 'function' && this.onclick === cancelObjectPlacement) {
            this.onclick(e);
        } else {
            // Иначе вызываем handleAddObject
            handleAddObject();
        }
    });

    // Добавление кабелей
    document.getElementById('addCable').addEventListener('click', function() {
        if (!isEditMode) {
            return;
        }
        
        // Если был режим размещения объектов, отменяем его
        if (objectPlacementMode) {
            cancelObjectPlacement();
        }
        
        currentCableTool = !currentCableTool;
        const cableBtn = this;
        
        if (currentCableTool) {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Отменить прокладку</span>';
            cableBtn.style.background = '#e74c3c';
            clearSelection();
            removeCablePreview();
            cableSource = null;
            // Изменяем курсор карты
            myMap.container.getElement().style.cursor = 'crosshair';
        } else {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
            cableBtn.style.background = '#3498db';
            clearSelection();
            removeCablePreview();
            cableSource = null;
            // Восстанавливаем курсор карты
            myMap.container.getElement().style.cursor = '';
        }
    });


    // Удаление объектов
    document.getElementById('deleteSelected').addEventListener('click', handleDeleteSelected);

    // Импорт/экспорт
    document.getElementById('importBtn').addEventListener('click', function() {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', handleFileImport);
    document.getElementById('exportData').addEventListener('click', exportData);

    // Очистка карты
    document.getElementById('clearAll').addEventListener('click', function() {
        if (confirm('Очистить всю карту? Все данные будут удалены.')) {
            clearMap();
        }
    });

    // Показ/скрытие полей настроек в зависимости от типа объекта
    document.getElementById('objectType').addEventListener('change', function() {
        const nameInputGroup = document.getElementById('objectNameGroup');
        const sleeveSettingsGroup = document.getElementById('sleeveSettingsGroup');
        const crossSettingsGroup = document.getElementById('crossSettingsGroup');
        const type = this.value;
        
        // Показываем имя для узлов и кроссов
        nameInputGroup.style.display = (type === 'node' || type === 'cross') ? 'block' : 'none';
        sleeveSettingsGroup.style.display = type === 'sleeve' ? 'block' : 'none';
        crossSettingsGroup.style.display = type === 'cross' ? 'block' : 'none';
        
        // Обновляем label для имени
        const nameLabel = nameInputGroup.querySelector('label');
        if (nameLabel) {
            nameLabel.textContent = type === 'cross' ? 'Имя кросса' : 'Имя узла';
        }
        
        // Автоматически заполняем максимальное количество волокон для выбранного типа муфты
        if (type === 'sleeve') {
            updateSleeveMaxFibers();
        }
        
        // Если режим размещения активен, обновляем тип размещения
        if (objectPlacementMode) {
            const newType = this.value;
            currentPlacementType = newType;
            // Для узлов и кроссов обновляем имя из поля ввода
            if (newType === 'node' || newType === 'cross') {
                const nameInput = document.getElementById('objectName');
                currentPlacementName = nameInput ? nameInput.value.trim() : '';
            } else {
                currentPlacementName = '';
            }
        }
    });
    
    // Обновление имени узла при вводе в поле (если режим размещения активен)
    const objectNameInput = document.getElementById('objectName');
    if (objectNameInput) {
        objectNameInput.addEventListener('input', function() {
            if (objectPlacementMode && currentPlacementType === 'node') {
                currentPlacementName = this.value.trim();
            }
        });
    }
    
    // Обработчик изменения типа муфты
    const sleeveTypeSelect = document.getElementById('sleeveType');
    if (sleeveTypeSelect) {
        sleeveTypeSelect.addEventListener('change', function() {
            updateSleeveMaxFibers();
        });
    }
    
    // Функция для автоматического заполнения максимального количества волокон
    function updateSleeveMaxFibers() {
        const sleeveType = document.getElementById('sleeveType').value;
        const maxFibersInput = document.getElementById('sleeveMaxFibers');
        
        // Карта типов муфт и их максимальной вместимости (из каталога NAG)
        const sleeveMaxFibersMap = {
            'SNR-FOSC-04': 4,
            'SNR-FOSC-X': 12,
            'SNR-FOSC-12': 12,
            'SNR-FOSC-D': 24,
            'SNR-FOSC-M': 48,
            'SNR-FOSC-G': 72,
            'SNR-FOSC-L': 96,
            'SNR-FOSC-B': 144,
            'SNR-FOSC-UF2': 144,
            'SNR-FOSC-CV018': 36,
            'SNR-FOSC-CV019': 36,
            'SNR-FOSC-CV021': 96,
            'SNR-FOSC-CV028A': 36,
            'SNR-FOSC-CV037': 36,
            'SNR-FOSC-Q-T': 36,
            'SNR-FOSC-D-T': 24,
            'SNR-FOSC-CH009': 24,
            'SNR-FOSC-CH018': 36,
            'SNR-FOSC-CH019': 36,
            'SNR-FOSC-CH025': 24,
            'SNR-FT-E': 12,
            'МВОТ-108-3-Т-1-36': 108,
            'МВОТ-216-4-Т-1-36': 216,
            'МВОТ-3611-22-32-2К16': 32,
            'МОГ-У-33-1К4845': 33,
            'МКО-Ц8/С09-5SC': 18,
            'МТОК-Ф3/216-1КТ3645-К': 216,
            'KSC-MURR': 12,
            '101-01-18': 18,
            'custom': 0
        };
        
        const maxFibers = sleeveMaxFibersMap[sleeveType] || 0;
        if (maxFibersInput) {
            maxFibersInput.value = maxFibers;
        }
    }
    
    // Инициализация аккордеонов
    setupAccordions();

    // Обработчик кликов по карте
    myMap.events.add('click', handleMapClick);
    
    // Обработчик движения мыши по карте для предпросмотра кабеля
    myMap.events.add('mousemove', handleMapMouseMove);
    
    // Глобальный обработчик движения мыши для отслеживания координат курсора
    document.addEventListener('mousemove', function(e) {
        window.lastMouseX = e.clientX;
        window.lastMouseY = e.clientY;
    });

    // Обработчик закрытия модального окна
    const modal = document.getElementById('infoModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = 'none';
        };
    }
    
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    // NetBox интеграция
    setupNetBoxEventListeners();
    loadNetBoxConfig();
}

let objectPlacementMode = false;
let currentPlacementType = null;
let currentPlacementName = null;

function handleAddObject() {
    if (!isEditMode) {
        return;
    }

    // Отменяем режим прокладки кабеля, если он активен
    if (currentCableTool) {
        currentCableTool = false;
        const cableBtn = document.getElementById('addCable');
        if (cableBtn) {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
            cableBtn.style.background = '#3498db';
        }
        clearSelection();
        removeCablePreview();
        cableSource = null;
        if (myMap && myMap.container) {
            myMap.container.getElement().style.cursor = '';
        }
    }


    const type = document.getElementById('objectType').value;
    
    // Всегда проверяем данные и запускаем/обновляем режим размещения
    if (type === 'node' || type === 'cross') {
        const name = document.getElementById('objectName').value.trim();
        if (!name) {
            // Если режим был активен, но имя пустое, отменяем режим
            if (objectPlacementMode) {
                cancelObjectPlacement();
            }
            alert(type === 'cross' ? 'Введите имя кросса' : 'Введите имя узла');
            return;
        }
        
        // Включаем или обновляем режим размещения
        objectPlacementMode = true;
        currentPlacementType = type;
        currentPlacementName = name;
        
        // Обновляем UI
        const addBtn = document.getElementById('addObject');
        addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Отменить размещение</span>';
        addBtn.style.background = '#e74c3c';
        addBtn.onclick = cancelObjectPlacement;
    } else {
        // Для опор и муфт также включаем/обновляем режим размещения
        objectPlacementMode = true;
        currentPlacementType = type;
        currentPlacementName = '';
        
        // Обновляем UI
        const addBtn = document.getElementById('addObject');
        addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Отменить размещение</span>';
        addBtn.style.background = '#e74c3c';
        addBtn.onclick = cancelObjectPlacement;
    }
}

function cancelObjectPlacement() {
    objectPlacementMode = false;
    currentPlacementType = null;
    currentPlacementName = null;
    
    // Удаляем фантомный объект
    removePhantomPlacemark();
    
    // Скрываем индикатор
    if (cursorIndicator) {
        cursorIndicator.style.display = 'none';
    }
    
    // Убираем подсветку
    if (hoveredObject) {
        clearHoverHighlight();
    }
    
    // Восстанавливаем кнопку
    const addBtn = document.getElementById('addObject');
    addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Добавить на карту</span>';
    addBtn.style.background = '#3498db';
    // Удаляем прямой обработчик onclick, чтобы использовался addEventListener
    addBtn.onclick = null;
}

function handleMapClick(e) {
    const coords = e.get('coords');
    
    // Сначала проверяем, не кликнули ли мы по кабелю через оригинальное событие
    const target = e.get('target');
    if (target && target.properties) {
        const type = target.properties.get('type');
        if (type === 'cable') {
            showCableInfo(target);
            return;
        }
    }
    
    // Проверяем, был ли клик по кабелю через поиск ближайшего кабеля
    // Ищем ближайший кабель к точке клика с максимально строгими условиями
    // Информация отображается ТОЛЬКО при прямом клике на кабель
    let clickedCable = null;
    let minDistance = Infinity;
    
    // Вычисляем максимально точный tolerance на основе масштаба карты
    // При отдаленном зуме (малый зум) делаем еще более строгим
    const zoom = myMap.getZoom();
    
    // Максимально строгие значения для всех уровней зума
    // При отдаленном зуме (zoom < 10) используем очень маленький tolerance
    // При среднем зуме (10-13) - средний tolerance
    // При близком зуме (13+) - минимальный tolerance
    let baseTolerance;
    if (zoom < 10) {
        // Отдаленный зум - очень строгий tolerance (примерно 0.3-0.5 метра)
        baseTolerance = 0.000003;
    } else if (zoom < 13) {
        // Средний зум - строгий tolerance (примерно 0.5-1 метр)
        baseTolerance = 0.000005;
    } else if (zoom < 15) {
        // Близкий зум - очень строгий tolerance (примерно 0.3-0.5 метра)
        baseTolerance = 0.000003;
    } else {
        // Очень близкий зум - минимальный tolerance (примерно 0.2-0.3 метра)
        baseTolerance = 0.000002;
    }
    
    objects.forEach(obj => {
        if (obj && obj.geometry && obj.properties) {
            const type = obj.properties.get('type');
            if (type === 'cable') {
                try {
                    // Получаем координаты кабеля
                    const cableCoords = obj.geometry.getCoordinates();
                    if (cableCoords && cableCoords.length >= 2) {
                        const fromCoords = cableCoords[0];
                        const toCoords = cableCoords[cableCoords.length - 1];
                        
                        // Вычисляем расстояние от точки до линии (расстояние от точки до отрезка)
                        const result = pointToLineDistance(coords, fromCoords, toCoords);
                        const distanceToLine = result.distance;
                        const param = result.param;
                        
                        // Максимально строгая проверка: клик должен быть строго в пределах отрезка кабеля
                        // param должен быть строго между 0 и 1 (минимальный запас ТОЛЬКО для концов)
                        // При отдаленном зуме делаем еще строже
                        const segmentTolerance = zoom < 10 ? 0.005 : 0.01;
                        const isWithinSegment = param >= -segmentTolerance && param <= 1 + segmentTolerance;
                        
                        // Учитываем визуальную ширину кабеля на экране
                        // Получаем ширину кабеля в пикселях и переводим в градусы
                        const cableType = obj.properties.get('cableType');
                        const cableWidthPixels = getCableWidth(cableType);
                        
                        // При отдаленном зуме пиксели занимают больше градусов на карте
                        // Но мы хотим строгий tolerance, поэтому используем меньшие коэффициенты
                        let pixelToDegree;
                        if (zoom < 10) {
                            // Отдаленный зум - очень строгий перевод (меньше градусов на пиксель)
                            pixelToDegree = 0.000002;
                        } else if (zoom < 13) {
                            // Средний зум
                            pixelToDegree = 0.000005;
                        } else if (zoom < 15) {
                            // Близкий зум
                            pixelToDegree = 0.000004;
                        } else {
                            // Очень близкий зум
                            pixelToDegree = 0.000003;
                        }
                        
                        const cableWidthInDegrees = (cableWidthPixels / 2) * pixelToDegree;
                        
                        // Используем максимально строгий tolerance - только ширина кабеля + минимальный запас
                        // При отдаленном зуме используем меньший коэффициент
                        const widthMultiplier = zoom < 10 ? 1.1 : 1.2;
                        const cableTolerance = Math.max(baseTolerance, cableWidthInDegrees * widthMultiplier);
                        
                        // ТОЛЬКО прямое попадание на кабель - никаких лишних допусков
                        if (isWithinSegment && distanceToLine < cableTolerance && distanceToLine < minDistance) {
                            minDistance = distanceToLine;
                            clickedCable = obj;
                        }
                    }
                } catch (error) {
                    // Игнорируем ошибки
                }
            }
        }
    });
    
    // Если клик по кабелю - показываем информацию (работает в любом режиме)
    if (clickedCable) {
        showCableInfo(clickedCable);
        return;
    }
    
    // В режиме просмотра блокируем остальные действия
    if (!isEditMode) {
        return;
    }
    
    // Режим размещения объектов
    if (objectPlacementMode) {
        const coords = e.get('coords');
        
        // В режиме размещения разрешаем создавать объекты рядом друг с другом
        // Проверяем только очень точное попадание в центр существующего объекта
        // Используем очень маленький tolerance, чтобы блокировать только точное попадание
        let shouldBlock = false;
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const objType = obj.properties.get('type');
                if (objType !== 'cable' && objType !== 'cableLabel') {
                    try {
                        const objCoords = obj.geometry.getCoordinates();
                        const latDiff = Math.abs(objCoords[0] - coords[0]);
                        const lonDiff = Math.abs(objCoords[1] - coords[1]);
                        // Блокируем только если клик ОЧЕНЬ близко к центру (примерно 1-2 метра на карте)
                        // Максимально уменьшили tolerance, чтобы можно было ставить объекты очень близко друг к другу
                        if (latDiff < 0.00001 && lonDiff < 0.00001) {
                            shouldBlock = true;
                        }
                    } catch (error) {
                        // Игнорируем ошибки
                    }
                }
            }
        });
        
        // Если клик точно по центру существующего объекта, не создаем новый
        if (shouldBlock) {
            return;
        }
        
        // Используем сохраненный тип и имя из переменных состояния
        const type = currentPlacementType || document.getElementById('objectType').value;
        
        if (type === 'node') {
            // Для узлов используем сохраненное имя или текущее из формы
            const name = currentPlacementName || document.getElementById('objectName').value.trim();
            createObject(type, name || '', coords);
            // Обновляем сохраненное имя для следующего размещения (даже если пустое)
            currentPlacementName = name || '';
        } else if (type === 'sleeve') {
            // Для муфт получаем настройки из формы
            const sleeveType = document.getElementById('sleeveType').value;
            const maxFibers = parseInt(document.getElementById('sleeveMaxFibers').value) || 0;
            createObject(type, '', coords, { sleeveType: sleeveType, maxFibers: maxFibers });
        } else if (type === 'cross') {
            // Для кросса получаем имя и количество портов
            const name = currentPlacementName || document.getElementById('objectName').value.trim();
            const crossPorts = parseInt(document.getElementById('crossPorts').value) || 24;
            createObject(type, name || '', coords, { crossPorts: crossPorts });
            currentPlacementName = name || '';
        } else {
            // Для опор не нужно имя
            createObject(type, '', coords);
        }
        return;
    }
    
    // Режим прокладки кабеля
    if (currentCableTool && isEditMode) {
        const coords = e.get('coords');
        
        // Проверяем клик по кабелю (приоритет - показываем информацию)
        let clickedCable = null;
        let minDistance = Infinity;
        const zoom = myMap.getZoom();
        const cableTolerance = zoom < 12 ? 0.000008 : (zoom < 15 ? 0.000005 : 0.000003);
        
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const type = obj.properties.get('type');
                if (type === 'cable') {
                    try {
                        const cableCoords = obj.geometry.getCoordinates();
                        if (cableCoords && cableCoords.length >= 2) {
                            const fromCoords = cableCoords[0];
                            const toCoords = cableCoords[cableCoords.length - 1];
                            const result = pointToLineDistance(coords, fromCoords, toCoords);
                            if (result.distance < cableTolerance && result.param >= -0.01 && result.param <= 1.01 && result.distance < minDistance) {
                                minDistance = result.distance;
                                clickedCable = obj;
                            }
                        }
                    } catch (error) {
                        // Игнорируем ошибки
                    }
                }
            }
        });
        
        if (clickedCable) {
            showCableInfo(clickedCable);
            return;
        }
        
        // Ищем объект под курсором
        const clickedObject = findObjectAtCoords(coords);
        
        if (clickedObject && clickedObject.geometry) {
            if (cableSource && cableSource !== clickedObject) {
                // Есть источник - создаем кабель от источника к кликнутому объекту
                const cableType = document.getElementById('cableType').value;
                const success = addCable(cableSource, clickedObject, cableType);
                if (success) {
                    // Кабель создан - новый источник = кликнутый объект (продолжаем цепочку)
                    cableSource = clickedObject;
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                }
            } else {
                // Нет источника или кликнули на тот же объект - устанавливаем как источник
                cableSource = clickedObject;
                clearSelection();
                selectObject(cableSource);
            }
        } else {
            // Клик по пустому месту - ищем ближайший объект (автоматическое прилипание)
            if (cableSource) {
                const autoSelectTolerance = zoom < 12 ? 0.0015 : (zoom < 15 ? 0.001 : 0.0005);
                let nearestObject = null;
                let minDist = Infinity;
                
                objects.forEach(obj => {
                    if (obj && obj.geometry && obj.properties) {
                        const objType = obj.properties.get('type');
                        if (objType !== 'cable' && objType !== 'cableLabel' && obj !== cableSource) {
                            try {
                                const objCoords = obj.geometry.getCoordinates();
                                const latDiff = Math.abs(objCoords[0] - coords[0]);
                                const lonDiff = Math.abs(objCoords[1] - coords[1]);
                                const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
                                
                                if (distance < autoSelectTolerance && distance < minDist) {
                                    minDist = distance;
                                    nearestObject = obj;
                                }
                            } catch (error) {
                                // Игнорируем ошибки
                            }
                        }
                    }
                });
                
                if (nearestObject) {
                    // Создаем кабель от источника к ближайшему объекту
                    const cableType = document.getElementById('cableType').value;
                    const success = addCable(cableSource, nearestObject, cableType);
                    if (success) {
                        // Кабель создан - новый источник = ближайший объект (продолжаем цепочку)
                        cableSource = nearestObject;
                        clearSelection();
                        selectObject(cableSource);
                        removeCablePreview();
                    }
                }
            }
        }
        return;
    }
    
}

function handleMapMouseMove(e) {
    // Сохраняем координаты мыши для индикатора
    try {
        if (e.originalEvent) {
            window.lastMouseX = e.originalEvent.clientX || 0;
            window.lastMouseY = e.originalEvent.clientY || 0;
        } else if (e.get) {
            const domEvent = e.get('domEvent');
            if (domEvent) {
                window.lastMouseX = domEvent.clientX || 0;
                window.lastMouseY = domEvent.clientY || 0;
            }
        }
    } catch (error) {
        // Игнорируем ошибки получения координат
    }
    
    // Всегда показываем подсветку при наведении на объекты (в режиме редактирования)
    if (!isEditMode) {
        // Сбрасываем подсветку в режиме просмотра
        if (hoveredObject) {
            clearHoverHighlight();
        }
        return;
    }
    
    // В режиме размещения объектов показываем фантомный объект под курсором
    if (objectPlacementMode) {
        const type = currentPlacementType;
        const coords = e.get('coords');
        
        // Создаем или обновляем фантомный объект под курсором
        updatePhantomPlacemark(type, coords);
        
        // Всегда показываем индикатор типа создаваемого объекта
        if (type) {
            updateCursorIndicator(e, type);
        }
        
        // В режиме размещения тоже показываем подсветку объектов при наведении
        const objectUnderCursor = findObjectAtCoords(coords);
        
        if (objectUnderCursor && objectUnderCursor !== hoveredObject) {
            if (hoveredObject) {
                clearHoverHighlight();
            }
            highlightObjectOnHover(objectUnderCursor, e);
            // Скрываем фантомный объект при наведении на существующий
            if (phantomPlacemark) {
                myMap.geoObjects.remove(phantomPlacemark);
                phantomPlacemark = null;
            }
        } else if (!objectUnderCursor && hoveredObject) {
            clearHoverHighlight();
            // Показываем фантомный объект обратно
            updatePhantomPlacemark(type, coords);
            // После снятия подсветки снова показываем индикатор типа создаваемого объекта
            if (type) {
                updateCursorIndicator(e, type);
            }
        }
        return;
    }
    
    // Режим прокладки кабеля - обновляем предпросмотр
    if (currentCableTool && cableSource) {
        const coords = e.get('coords');
        
        // Уменьшенный tolerance для более точного "прилипания" к объектам
        const zoom = myMap.getZoom();
        const autoSnapTolerance = zoom < 12 ? 0.0015 : (zoom < 15 ? 0.001 : 0.0005);
        
        // Ищем ближайший объект для "притягивания"
        let nearestObject = null;
        let minDistance = Infinity;
        
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const objType = obj.properties.get('type');
                // Исключаем кабели, метки кабелей и сам источник
                if (objType !== 'cable' && objType !== 'cableLabel' && obj !== cableSource) {
                    try {
                        const objCoords = obj.geometry.getCoordinates();
                        const latDiff = Math.abs(objCoords[0] - coords[0]);
                        const lonDiff = Math.abs(objCoords[1] - coords[1]);
                        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
                        
                        if (distance < autoSnapTolerance && distance < minDistance) {
                            minDistance = distance;
                            nearestObject = obj;
                        }
                    } catch (error) {
                        // Игнорируем ошибки
                    }
                }
            }
        });
        
        let targetObject = null;
        let previewCoords = coords;
        
        // Если нашли ближайший объект, "притягиваем" к нему и подсвечиваем
        if (nearestObject) {
            targetObject = nearestObject;
            previewCoords = nearestObject.geometry.getCoordinates();
            
            // Подсвечиваем объект
            if (targetObject !== hoveredObject) {
                if (hoveredObject) {
                    clearHoverHighlight();
                }
                highlightObjectOnHover(targetObject, e);
            }
        } else {
            // Убираем подсветку, если ушли от объекта
            if (hoveredObject) {
                clearHoverHighlight();
            }
        }
        
        // Обновляем предпросмотр кабеля от источника к курсору
        updateCablePreview(cableSource, previewCoords);
        return;
    }
    
    // В обычном режиме редактирования показываем подсветку
    {
        // Если нет выбранной точки, проверяем наведение на объекты и кабели (как в vols.expert)
        const coords = e.get('coords');
        const objectUnderCursor = findObjectAtCoords(coords);
        
        // Проверяем также кабели при наведении
        let cableUnderCursor = null;
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const type = obj.properties.get('type');
                if (type === 'cable') {
                    try {
                        const cableCoords = obj.geometry.getCoordinates();
                        if (cableCoords && cableCoords.length >= 2) {
                            const fromCoords = cableCoords[0];
                            const toCoords = cableCoords[cableCoords.length - 1];
                            const result = pointToLineDistance(coords, fromCoords, toCoords);
                            const zoom = myMap.getZoom();
                            const cableTolerance = zoom < 12 ? 0.000008 : (zoom < 15 ? 0.000005 : 0.000003);
                            if (result.distance < cableTolerance && result.param >= -0.01 && result.param <= 1.01) {
                                cableUnderCursor = obj;
                            }
                        }
                    } catch (error) {
                        // Игнорируем ошибки
                    }
                }
            }
        });
        
        const targetObject = objectUnderCursor || cableUnderCursor;
        
        if (targetObject && targetObject !== hoveredObject) {
            // Навели на новый объект - подсвечиваем его (как в vols.expert)
            if (hoveredObject) {
                clearHoverHighlight();
            }
            highlightObjectOnHover(targetObject, e);
        } else if (!targetObject && hoveredObject) {
            // Убрали мышь с объекта
            clearHoverHighlight();
        }
    }
}


// Создает индикатор под курсором
function createCursorIndicator() {
    cursorIndicator = document.createElement('div');
    cursorIndicator.id = 'cursorIndicator';
    cursorIndicator.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        background: rgba(59, 130, 246, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(cursorIndicator);
}

// Обновляет позицию индикатора под курсором
function updateCursorIndicator(e, objectType) {
    if (!cursorIndicator) return;
    
    if (objectType && e) {
        let text = '';
        switch(objectType) {
            case 'support':
                text = 'Опора связи';
                break;
            case 'sleeve':
                text = 'Кабельная муфта';
                break;
            case 'cross':
                text = 'Оптический кросс';
                break;
            case 'node':
                text = 'Узел сети';
                break;
            case 'cable':
                text = 'Кабель';
                break;
            default:
                text = 'Объект';
        }
        cursorIndicator.textContent = text;
        cursorIndicator.style.display = 'block';
        
        // Получаем координаты курсора
        // Используем последние известные координаты мыши
        const clientX = window.lastMouseX || 0;
        const clientY = window.lastMouseY || 0;
        
        if (clientX > 0 && clientY > 0) {
            cursorIndicator.style.left = (clientX + 15) + 'px';
            cursorIndicator.style.top = (clientY - 35) + 'px';
        }
    } else {
        cursorIndicator.style.display = 'none';
    }
}

// Создает или обновляет фантомный объект под курсором
function updatePhantomPlacemark(type, coords) {
    if (!type || !coords) {
        removePhantomPlacemark();
        return;
    }
    
    // Если фантомный объект уже существует, просто обновляем его координаты
    if (phantomPlacemark) {
        phantomPlacemark.geometry.setCoordinates(coords);
        return;
    }
    
    // Создаем новый фантомный объект
    let iconSvg, color;
    
    switch(type) {
        case 'support':
            color = '#3b82f6';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.5"/>
            </svg>`;
            break;
        case 'sleeve':
            color = '#ef4444';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.5"/>
            </svg>`;
            break;
        case 'node':
            color = '#22c55e';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5" opacity="0.6"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.5"/>
                <circle cx="16" cy="16" r="3" fill="${color}" opacity="0.8"/>
            </svg>`;
            break;
        default:
            color = '#94a3b8';
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
            </svg>`;
    }
    
    const clickableSize = 36;
    const iconSize = type === 'node' ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    phantomPlacemark = new ymaps.Placemark(coords, {
        type: 'phantom',
        balloonContent: 'Предпросмотр объекта'
    }, {
        iconLayout: 'default#image',
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2],
        iconImageOpacity: 0.7, // Полупрозрачный для визуального отличия
        zIndex: 9999, // Высокий z-index, чтобы быть поверх других объектов
        interactive: false, // Не интерактивный, чтобы не мешать кликам
        cursor: 'crosshair'
    });
    
    myMap.geoObjects.add(phantomPlacemark);
}

// Удаляет фантомный объект
function removePhantomPlacemark() {
    if (phantomPlacemark) {
        myMap.geoObjects.remove(phantomPlacemark);
        phantomPlacemark = null;
    }
}

// Подсвечивает объект при наведении мыши в режиме прокладки кабеля
function highlightObjectOnHover(obj, e) {
    if (!obj || !obj.properties) {
        return;
    }
    
    // Не подсвечиваем, если объект уже выбран
    if (selectedObjects.includes(obj)) {
        return;
    }
    
    hoveredObject = obj;
    
    const type = obj.properties.get('type');
    
    // Показываем индикатор под курсором
    updateCursorIndicator(e, type);
    
    // Для кабелей только показываем индикатор и круг, не меняем иконку
    if (type === 'cable' || type === 'cableLabel') {
        // Создаем круг вокруг кабеля для визуализации кликабельной зоны
        showHoverCircle(obj, e);
        // Подсвечиваем кабель, делая его толще и ярче
        highlightCableOnHover(obj);
        return;
    }
    
    // Создаем подсвеченную версию иконки (с голубой обводкой)
    let iconSvg;
    
    switch(type) {
        case 'support':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="#3b82f6" stroke="#60a5fa" stroke-width="3"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'sleeve':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="#ef4444" stroke="#f87171" stroke-width="3"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'node':
            iconSvg = `<svg width="36" height="36" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#22c55e" stroke="#4ade80" stroke-width="3"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="#22c55e"/>
            </svg>`;
            break;
        default:
            return;
    }
    
    // Создаем увеличенную область клика для подсвеченного объекта
    const clickableSize = 36;
    const iconSize = type === 'node' ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    // Сохраняем оригинальную иконку для восстановления
    hoveredObjectOriginalIcon = {
        href: obj.options.get('iconImageHref'),
        size: obj.options.get('iconImageSize'),
        offset: obj.options.get('iconImageOffset')
    };
    
    obj.options.set({
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2]
    });
    
    // Показываем круг вокруг объекта для визуализации кликабельной зоны
    showHoverCircle(obj, e);
}

// Показывает круг вокруг объекта при наведении
function showHoverCircle(obj, e) {
    if (!obj || !obj.geometry) return;
    
    // Удаляем предыдущий круг, если есть
    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
    
    const type = obj.properties ? obj.properties.get('type') : null;
    
    // Для кабелей показываем круг вокруг точки на кабеле, ближайшей к курсору
    if (type === 'cable') {
        if (!e) return;
        
        const coords = e.get('coords');
        const cableCoords = obj.geometry.getCoordinates();
        
        if (cableCoords && cableCoords.length >= 2) {
            const fromCoords = cableCoords[0];
            const toCoords = cableCoords[cableCoords.length - 1];
            
            // Находим ближайшую точку на кабеле к курсору
            const result = pointToLineDistance(coords, fromCoords, toCoords);
            const param = Math.max(0, Math.min(1, result.param));
            
            // Вычисляем координаты ближайшей точки на кабеле
            const nearestPoint = [
                fromCoords[0] + param * (toCoords[0] - fromCoords[0]),
                fromCoords[1] + param * (toCoords[1] - fromCoords[1])
            ];
            
            // Радиус круга зависит от зума
            const zoom = myMap.getZoom();
            const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00015 : 0.0001);
            
            hoverCircle = new ymaps.Circle([nearestPoint, radius], {}, {
                fillColor: 'rgba(59, 130, 246, 0.2)',
                strokeColor: '#3b82f6',
                strokeWidth: 2,
                strokeStyle: 'solid',
                zIndex: 999
            });
            
            myMap.geoObjects.add(hoverCircle);
        }
    } else {
        // Для обычных объектов показываем круг вокруг центра
        const coords = obj.geometry.getCoordinates();
        
        // Радиус примерно 15-25 метров в зависимости от зума
        const zoom = myMap.getZoom();
        const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00018 : 0.00012);
        
        hoverCircle = new ymaps.Circle([coords, radius], {}, {
            fillColor: 'rgba(59, 130, 246, 0.2)',
            strokeColor: '#3b82f6',
            strokeWidth: 2.5,
            strokeStyle: 'solid',
            zIndex: 999
        });
        
        myMap.geoObjects.add(hoverCircle);
    }
}

// Убирает круг при наведении
function removeHoverCircle() {
    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
}

// Подсвечивает кабель при наведении
function highlightCableOnHover(cable) {
    if (!cable || !cable.properties) return;
    
    // Сохраняем оригинальные параметры кабеля
    if (!cable.properties.get('originalCableOptions')) {
        const originalOptions = {
            strokeWidth: cable.options.get('strokeWidth'),
            strokeColor: cable.options.get('strokeColor'),
            strokeOpacity: cable.options.get('strokeOpacity')
        };
        cable.properties.set('originalCableOptions', originalOptions);
    }
    
    // Делаем кабель толще и ярче
    const cableType = cable.properties.get('cableType');
    const normalWidth = getCableWidth(cableType);
    const normalColor = getCableColor(cableType);
    
    cable.options.set({
        strokeWidth: normalWidth * 1.8,
        strokeColor: '#60a5fa', // Голубой цвет для подсветки
        strokeOpacity: 0.95,
        zIndex: 998
    });
}

// Убирает подсветку кабеля
function clearCableHoverHighlight(cable) {
    if (!cable || !cable.properties) return;
    
    const originalOptions = cable.properties.get('originalCableOptions');
    if (originalOptions) {
        cable.options.set({
            strokeWidth: originalOptions.strokeWidth,
            strokeColor: originalOptions.strokeColor,
            strokeOpacity: originalOptions.strokeOpacity,
            zIndex: 0
        });
        cable.properties.unset('originalCableOptions');
    }
}

// Убирает подсветку объекта при наведении
function clearHoverHighlight() {
    if (hoveredObject) {
        const type = hoveredObject.properties ? hoveredObject.properties.get('type') : null;
        
        if (type === 'cable') {
            // Для кабелей убираем специальную подсветку
            clearCableHoverHighlight(hoveredObject);
        } else if (hoveredObjectOriginalIcon) {
            // Для обычных объектов восстанавливаем иконку
            hoveredObject.options.set({
                iconImageHref: hoveredObjectOriginalIcon.href,
                iconImageSize: hoveredObjectOriginalIcon.size,
                iconImageOffset: hoveredObjectOriginalIcon.offset
            });
        }
    }
    
    hoveredObject = null;
    hoveredObjectOriginalIcon = null;
    removeHoverCircle();
    updateCursorIndicator(null, null);
}


function handleDeleteSelected() {
    if (!isEditMode) {
        return;
    }

    if (selectedObjects.length === 0) {
        return;
    }

    if (confirm(`Удалить ${selectedObjects.length} объектов?`)) {
        selectedObjects.forEach(obj => deleteObject(obj));
        clearSelection();
    }
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                clearMap();
                importData(data);
            } catch (error) {
                console.error('Ошибка при импорте файла:', error);
            }
        };
        reader.readAsText(file);
    }
}

function switchToViewMode() {
    isEditMode = false;
    currentCableTool = false;
    cableSource = null;
    
    // Отменяем режим размещения объектов
    if (objectPlacementMode) {
        cancelObjectPlacement();
    }
    
    removeCablePreview();
    updateUIForMode();
    
    clearSelection();
    
    // Убираем подсветку и курсор
    if (hoveredObject) {
        clearHoverHighlight();
    }
    if (myMap && myMap.container) {
        myMap.container.getElement().style.cursor = '';
    }
    
    updateEditControls();
    makeObjectsNonDraggable();
}

function switchToEditMode() {
    isEditMode = true;
    updateUIForMode();
    updateEditControls();
    makeObjectsDraggable();
}

function updateUIForMode() {
    const viewBtn = document.getElementById('viewMode');
    const editBtn = document.getElementById('editMode');
    
    if (viewBtn) viewBtn.classList.toggle('active', !isEditMode);
    if (editBtn) editBtn.classList.toggle('active', isEditMode);
}

function updateEditControls() {
    const editControls = document.querySelectorAll('#addObject, #addCable, #deleteSelected, #clearAll');
    
    editControls.forEach(control => {
        control.style.opacity = isEditMode ? '1' : '0.5';
        control.style.pointerEvents = isEditMode ? 'all' : 'none';
    });
}

function makeObjectsDraggable() {
    objects.forEach(obj => {
        if (obj.options && obj.properties.get('type') !== 'cable') {
            obj.options.set('draggable', true);
        }
    });
}

function makeObjectsNonDraggable() {
    objects.forEach(obj => {
        if (obj.options && obj.properties.get('type') !== 'cable') {
            obj.options.set('draggable', false);
        }
    });
}

function createObject(type, name, coords, options = {}) {
    let iconSvg, color, balloonContent;
    
    switch(type) {
        case 'support':
            // Опора связи - синий квадрат с закругленными углами
            color = '#3b82f6';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = 'Опора связи';
            break;
        case 'sleeve':
            // Кабельная муфта - красный шестиугольник
            color = '#ef4444';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = 'Кабельная муфта';
            break;
        case 'cross':
            // Оптический кросс - фиолетовый прямоугольник с портами
            color = '#8b5cf6';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="28" height="24" rx="3" fill="${color}" stroke="white" stroke-width="2"/>
                <line x1="10" y1="4" x2="10" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="16" y1="4" x2="16" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="22" y1="4" x2="22" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <circle cx="10" cy="12" r="2" fill="white"/>
                <circle cx="16" cy="12" r="2" fill="white"/>
                <circle cx="22" cy="12" r="2" fill="white"/>
                <circle cx="10" cy="20" r="2" fill="white"/>
                <circle cx="16" cy="20" r="2" fill="white"/>
                <circle cx="22" cy="20" r="2" fill="white"/>
            </svg>`;
            balloonContent = `Оптический кросс: ${name}`;
            break;
        case 'node':
            // Узел сети - зеленый круг с иконкой
            color = '#22c55e';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="${color}"/>
            </svg>`;
            balloonContent = `Узел сети: ${name}`;
            break;
        default:
            color = '#94a3b8';
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>`;
            balloonContent = 'Объект';
    }

    // Создаем SVG с увеличенной невидимой областью для удобства клика
    // Добавляем прозрачную область вокруг иконки
    const clickableSize = 36; // Область клика 36x36 пикселей
    const iconSize = (type === 'node' || type === 'cross') ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    // Извлекаем содержимое SVG без тегов svg
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2],
        draggable: isEditMode
    };
    
    const placemarkProperties = {
        type: type,
        name: name,
        balloonContent: balloonContent
    };
    
    // Сохраняем настройки муфты
    if (type === 'sleeve' && options.sleeveType) {
        placemarkProperties.sleeveType = options.sleeveType;
        placemarkProperties.maxFibers = options.maxFibers || 0;
    }
    
    // Сохраняем настройки кросса
    if (type === 'cross') {
        placemarkProperties.crossPorts = options.crossPorts || 24;
    }
    
    const placemark = new ymaps.Placemark(coords, placemarkProperties, placemarkOptions);
    
    // Для узлов и кроссов добавляем подпись с названием под маркером
    if (type === 'node' || type === 'cross') {
        updateNodeLabel(placemark, name);
        
        // Обновляем позицию метки при перетаскивании
        placemark.events.add('dragend', function() {
            const coords = placemark.geometry.getCoordinates();
            const label = placemark.properties.get('label');
            if (label && label.geometry) {
                label.geometry.setCoordinates(coords);
            }
        });
    }

    placemark.events.add('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); // Останавливаем всплытие события
        
        // Режим размещения объектов - игнорируем клик по существующим объектам
        if (objectPlacementMode) {
            return;
        }
        
        // Режим прокладки кабеля - обрабатываем выбор объектов
        if (currentCableTool && isEditMode) {
            // Узлы сети нельзя использовать для прокладки кабеля
            if (type === 'node') {
                alert('Узел сети нельзя использовать для прокладки кабеля!\n\nУзлы подключаются только через жилы оптического кросса.');
                return;
            }
            
            if (cableSource && cableSource !== placemark) {
                // Есть источник - создаем кабель от источника к кликнутому объекту
                const cableType = document.getElementById('cableType').value;
                const success = addCable(cableSource, placemark, cableType);
                if (success) {
                    // Кабель создан - новый источник = кликнутый объект (продолжаем цепочку)
                    cableSource = placemark;
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                }
            } else {
                // Нет источника или кликнули на тот же объект - устанавливаем как источник
                cableSource = placemark;
                clearSelection();
                selectObject(cableSource);
            }
            return;
        }
        
        // Для узлов, кроссов и муфт показываем информацию
        if ((type === 'node' || type === 'sleeve' || type === 'cross')) {
            showObjectInfo(placemark);
            return;
        }
        
        // В режиме просмотра не позволяем выделять объекты
        if (!isEditMode) {
            return;
        }
        
        if (selectedObjects.includes(placemark)) {
            deselectObject(placemark);
        } else {
            selectObject(placemark);
        }
    });

    placemark.events.add('dragend', function() {
        saveData();
        updateConnectedCables(placemark);
        // Обновляем позицию подписи, если она есть
        const label = placemark.properties.get('label');
        if (label) {
            label.geometry.setCoordinates(placemark.geometry.getCoordinates());
        }
        // Обновляем линии соединений кросс-узел
        updateAllNodeConnectionLines();
    });

    objects.push(placemark);
    myMap.geoObjects.add(placemark);
    saveData();
    updateStats();
}

function deleteObject(obj) {
    // Удаляем подпись, если она есть
    const label = obj.properties.get('label');
    if (label) {
        myMap.geoObjects.remove(label);
    }
    
    // Удаляем связанные кабели
    const cablesToRemove = objects.filter(cable => 
        cable.properties && 
        cable.properties.get('type') === 'cable' &&
        (cable.properties.get('from') === obj || cable.properties.get('to') === obj)
    );
    
    cablesToRemove.forEach(cable => {
        myMap.geoObjects.remove(cable);
        objects = objects.filter(o => o !== cable);
    });
    
    // Удаляем сам объект
    myMap.geoObjects.remove(obj);
    objects = objects.filter(o => o !== obj);
    
    // Обновляем визуализацию кабелей (количество на линиях)
    updateCableVisualization();
    
    saveData();
    updateStats();
}

function selectObject(obj) {
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        // Для выделения создаем версию иконки с желтой обводкой
        const type = obj.properties.get('type');
        let iconSvg;
        
        switch(type) {
            case 'support':
                iconSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="2" width="24" height="24" rx="4" fill="#3b82f6" stroke="#fbbf24" stroke-width="3"/>
                    <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
                </svg>`;
                break;
            case 'sleeve':
                iconSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="#ef4444" stroke="#fbbf24" stroke-width="3"/>
                    <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
                </svg>`;
                break;
            case 'node':
                iconSvg = `<svg width="36" height="36" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16" cy="16" r="14" fill="#22c55e" stroke="#fbbf24" stroke-width="3"/>
                    <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                    <circle cx="16" cy="16" r="3" fill="#22c55e"/>
                </svg>`;
                break;
            default:
                iconSvg = `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#94a3b8" stroke="#fbbf24" stroke-width="3"/>
                </svg>`;
        }
        
        // Создаем увеличенную область клика для выделенного объекта
        const clickableSize = 36;
        const iconSize = type === 'node' ? 32 : 28;
        const iconOffset = (clickableSize - iconSize) / 2;
        
        // Извлекаем содержимое SVG без тегов svg
        const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
        
        const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
            <g transform="translate(${iconOffset}, ${iconOffset})">
                ${svgContent}
            </g>
        </svg>`;
        
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
        
        obj.options.set({
            iconImageHref: svgDataUrl,
            iconImageSize: [clickableSize, clickableSize],
            iconImageOffset: [-clickableSize / 2, -clickableSize / 2]
        });
    }
}

function deselectObject(obj) {
    selectedObjects = selectedObjects.filter(o => o !== obj);
    
    // Восстанавливаем оригинальную иконку
    const type = obj.properties.get('type');
    let iconSvg;
    
    switch(type) {
        case 'support':
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="#3b82f6" stroke="white" stroke-width="2"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'sleeve':
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="#ef4444" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'node':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#22c55e" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="#22c55e"/>
            </svg>`;
            break;
        default:
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#94a3b8" stroke="white" stroke-width="2"/>
            </svg>`;
    }
    
    // Создаем увеличенную область клика для обычного объекта
    const clickableSize = 36;
    const iconSize = type === 'node' ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    // Извлекаем содержимое SVG без тегов svg
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    obj.options.set({
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2]
    });
}

function clearSelection() {
    while (selectedObjects.length > 0) {
        deselectObject(selectedObjects[0]);
    }
    // НЕ удаляем предпросмотр здесь, так как он нужен для продолжения цепочки кабелей
    // removeCablePreview();
}

// Универсальная функция создания кабеля (для обратной совместимости)
// Поддерживает как старый формат (2 точки), так и новый (массив точек)
function addCable(fromObj, toObj, cableType, existingCableId = null, fiberNumber = null) {
    // Если toObj - массив, значит это новый формат с несколькими точками
    if (Array.isArray(toObj)) {
        return createCableFromPoints(toObj, cableType, existingCableId);
    }
    
    // Старый формат: создаем кабель между двумя точками
    return createCableFromPoints([fromObj, toObj], cableType, existingCableId, fiberNumber);
}

// Создает кабель из массива точек
function createCableFromPoints(points, cableType, existingCableId = null, fiberNumber = null) {
    if (!points || points.length < 2) {
        return false;
    }
    
    // Проверяем, что кабель не подключается к узлу сети
    // Узлы сети соединяются только через жилы с кросса
    for (const obj of points) {
        if (obj && obj.properties && obj.properties.get('type') === 'node') {
            alert('Ошибка: Нельзя прокладывать кабель напрямую к узлу сети!\n\nУзлы сети подключаются только через жилы оптического кросса.\nПуть: Кросс → Опора → Муфта → Опора → Кросс → Узел');
            return false;
        }
    }
    
    // Проверяем максимальную вместимость муфт
    const fiberCount = getFiberCount(cableType);
    
    for (let i = 0; i < points.length; i++) {
        const obj = points[i];
        if (obj && obj.properties && obj.properties.get('type') === 'sleeve') {
            const maxFibers = obj.properties.get('maxFibers');
            if (maxFibers && maxFibers > 0) {
                const usedFibersCount = getTotalUsedFibersInSleeve(obj);
                // Учитываем, что муфта будет использоваться для двух сегментов (кроме первой и последней)
                const segmentsCount = (i === 0 || i === points.length - 1) ? 1 : 2;
                if (usedFibersCount + (fiberCount * segmentsCount) > maxFibers) {
                    alert(`Ошибка: Превышена максимальная вместимость муфты!\nИспользовано: ${usedFibersCount}/${maxFibers} волокон\nПопытка добавить: ${fiberCount * segmentsCount} волокон`);
                    return false;
                }
            }
        }
    }
    
    // Получаем координаты всех точек
    const coords = points.map(obj => obj.geometry.getCoordinates());
    
    // Вычисляем общее расстояние
    let totalDistance = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        totalDistance += calculateDistance(coords[i], coords[i + 1]);
    }
    
    const cableColor = getCableColor(cableType);
    const cableWidth = getCableWidth(cableType);
    const cableDescription = getCableDescription(cableType);
    
    // Генерируем уникальный ID для кабеля
    const cableUniqueId = existingCableId || `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Создаем полилинию кабеля
    const polyline = new ymaps.Polyline(coords, {
        balloonContent: `${cableDescription}<br>Расстояние: ${totalDistance.toFixed(2)} м`
    }, {
        strokeColor: cableColor,
        strokeWidth: cableWidth,
        strokeOpacity: 0.8
    });
    
    polyline.properties.set({
        type: 'cable',
        cableType: cableType,
        from: points[0],
        to: points[points.length - 1],
        uniqueId: cableUniqueId,
        distance: totalDistance,
        points: points // Сохраняем все точки
    });
    
    // Добавляем обработчик клика на кабель
    polyline.events.add('click', function(e) {
        try {
            if (e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') {
                e.originalEvent.stopPropagation();
            }
            if (e.stopPropagation && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }
        } catch (error) {
            // Игнорируем ошибки
        }
        showCableInfo(polyline);
        return false;
    });
    
    objects.push(polyline);
    myMap.geoObjects.add(polyline);
    
    // Если указан номер жилы, помечаем её как использованную
    if (fiberNumber !== null && points.length >= 2) {
        markFiberAsUsed(points[0], cableUniqueId, fiberNumber);
        markFiberAsUsed(points[points.length - 1], cableUniqueId, fiberNumber);
    }
    
    // Обновляем визуализацию кабелей
    updateCableVisualization();
    
    saveData();
    updateStats();
    
    return true;
}

function markFiberAsUsed(obj, cableId, fiberNumber) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
    }
    
    if (!usedFibersData[cableId]) {
        usedFibersData[cableId] = [];
    }
    
    if (!usedFibersData[cableId].includes(fiberNumber)) {
        usedFibersData[cableId].push(fiberNumber);
    }
    
    obj.properties.set('usedFibers', usedFibersData);
    saveData();
}



function updateConnectedCables(obj) {
    const cables = objects.filter(cable => 
        cable.properties && 
        cable.properties.get('type') === 'cable' &&
        (cable.properties.get('from') === obj || cable.properties.get('to') === obj)
    );
    
    cables.forEach(cable => {
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        const fromCoords = fromObj.geometry.getCoordinates();
        const toCoords = toObj.geometry.getCoordinates();
        
        cable.geometry.setCoordinates([fromCoords, toCoords]);
    });
}

function getCableColor(type) {
    switch(type) {
        case 'fiber4': return '#00FF00'; // Ярко-зеленый
        case 'fiber8': return '#00AA00'; // Зеленый
        case 'fiber16': return '#008800'; // Темно-зеленый
        case 'fiber24': return '#006600'; // Очень темный зеленый
        case 'copper': return '#FF7700'; // Оранжевый
        default: return '#64748b'; // Серый
    }
}

function getCableWidth(type) {
    switch(type) {
        case 'fiber4': return 2;
        case 'fiber8': return 3;
        case 'fiber16': return 4;
        case 'fiber24': return 5;
        case 'copper': return 4;
        default: return 2;
    }
}

function getCableDescription(type) {
    switch(type) {
        case 'fiber4': return 'ВОЛС 4 жилы';
        case 'fiber8': return 'ВОЛС 8 жил';
        case 'fiber16': return 'ВОЛС 16 жил';
        case 'fiber24': return 'ВОЛС 24 жилы';
        case 'copper': return 'Медный кабель';
        default: return 'Кабель';
    }
}

// Вычисляет расстояние между двумя точками на карте в метрах
function calculateDistance(coords1, coords2) {
    const R = 6371000; // Радиус Земли в метрах
    const lat1 = coords1[0] * Math.PI / 180;
    const lat2 = coords2[0] * Math.PI / 180;
    const deltaLat = (coords2[0] - coords1[0]) * Math.PI / 180;
    const deltaLon = (coords2[1] - coords1[1]) * Math.PI / 180;
    
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const distance = R * c;
    return Math.round(distance);
}

// Вычисляет расстояние от точки до отрезка (в градусах)
// Возвращает объект с расстоянием и параметром param (0-1 означает, что точка в пределах отрезка)
function pointToLineDistance(point, lineStart, lineEnd) {
    const A = point[0] - lineStart[0];
    const B = point[1] - lineStart[1];
    const C = lineEnd[0] - lineStart[0];
    const D = lineEnd[1] - lineStart[1];
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq != 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
        xx = lineStart[0];
        yy = lineStart[1];
    } else if (param > 1) {
        xx = lineEnd[0];
        yy = lineEnd[1];
    } else {
        xx = lineStart[0] + param * C;
        yy = lineStart[1] + param * D;
    }
    
    const dx = point[0] - xx;
    const dy = point[1] - yy;
    return {
        distance: Math.sqrt(dx * dx + dy * dy),
        param: param // Параметр: 0-1 означает, что точка в пределах отрезка
    };
}

// Показывает информацию о кабеле
function showCableInfo(cable) {
    const cableType = cable.properties.get('cableType');
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    const distance = cable.properties.get('distance');
    const uniqueId = cable.properties.get('uniqueId');
    const cableName = cable.properties.get('cableName') || '';
    
    const cableDescription = getCableDescription(cableType);
    
    // Определяем типы объектов
    let fromType = 'Объект';
    let toType = 'Объект';
    if (fromObj && fromObj.properties) {
        const type = fromObj.properties.get('type');
        if (type === 'support') fromType = 'Опора связи';
        else if (type === 'sleeve') fromType = 'Кабельная муфта';
        else if (type === 'cross') fromType = 'Оптический кросс';
        else if (type === 'node') fromType = 'Узел сети';
    }
    if (toObj && toObj.properties) {
        const type = toObj.properties.get('type');
        if (type === 'support') toType = 'Опора связи';
        else if (type === 'sleeve') toType = 'Кабельная муфта';
        else if (type === 'cross') toType = 'Оптический кросс';
        else if (type === 'node') toType = 'Узел сети';
    }
    
    // Получаем имена объектов
    let fromName = '';
    let toName = '';
    if (fromObj && fromObj.properties) {
        const name = fromObj.properties.get('name');
        if (name) fromName = ` "${name}"`;
    }
    if (toObj && toObj.properties) {
        const name = toObj.properties.get('name');
        if (name) toName = ` "${name}"`;
    }
    
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalInfo');
    
    if (!modal || !modalContent) {
        console.error('Модальное окно не найдено!');
        return;
    }
    
    // Обновляем заголовок
    modalTitle.textContent = 'Информация о кабеле';
    
    let html = '<div class="info-section">';
    html += `<h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 18px;">${cableDescription}</h3>`;
    
    // Поле для названия кабеля
    html += '<div style="margin-bottom: 15px;">';
    html += '<div class="form-group" style="margin-bottom: 12px;">';
    html += '<label style="display: block; margin-bottom: 4px; font-weight: 600; color: #495057; font-size: 0.8125rem;">Название кабеля:</label>';
    if (isEditMode) {
        html += `<input type="text" id="cableNameInput" value="${cableName}" placeholder="Введите название кабеля" 
            style="width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.875rem;" 
            onchange="updateCableName('${uniqueId}', this.value)">`;
    } else {
        html += `<div style="padding: 8px 12px; background: #f8f9fa; border-radius: 4px; font-size: 0.875rem;">${cableName || '<span style="color: #6c757d; font-style: italic;">Не задано</span>'}</div>`;
    }
    html += '</div>';
    
    html += `<div style="margin-bottom: 8px;"><strong>От:</strong> ${fromType}${fromName}</div>`;
    html += `<div style="margin-bottom: 8px;"><strong>До:</strong> ${toType}${toName}</div>`;
    
    // Всегда пересчитываем расстояние при открытии модального окна
    let displayDistance = 'неизвестно';
    if (fromObj && toObj && fromObj.geometry && toObj.geometry) {
        const fromCoords = fromObj.geometry.getCoordinates();
        const toCoords = toObj.geometry.getCoordinates();
        displayDistance = calculateDistance(fromCoords, toCoords);
        // Обновляем сохраненное расстояние
        cable.properties.set('distance', displayDistance);
        // Обновляем balloonContent
        const namePrefix = cableName ? `${cableName} - ` : '';
        cable.properties.set('balloonContent', `${namePrefix}${cableDescription}<br>Расстояние: ${displayDistance} м`);
        // Сохраняем данные
        saveData();
    }
    
    if (typeof displayDistance === 'number') {
        html += `<div style="margin-bottom: 8px;"><strong>Расстояние:</strong> ${displayDistance} м (${(displayDistance / 1000).toFixed(2)} км)</div>`;
    } else {
        html += `<div style="margin-bottom: 8px;"><strong>Расстояние:</strong> ${displayDistance}</div>`;
    }
    html += '</div>';
    
    // Кнопки действий (только в режиме редактирования)
    if (isEditMode) {
        html += '<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">';
        html += `<button class="btn-danger" onclick="deleteCableByUniqueId('${uniqueId}')" style="width: 100%; margin-top: 10px;">`;
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">';
        html += '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>';
        html += '</svg>Удалить кабель</button>';
        html += '</div>';
    }
    
    html += '</div>';
    
    modalContent.innerHTML = html;
    modal.style.display = 'block';
    currentModalObject = cable;
}

// Обновление названия кабеля
function updateCableName(cableUniqueId, newName) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (cable) {
        cable.properties.set('cableName', newName);
        const cableType = cable.properties.get('cableType');
        const cableDescription = getCableDescription(cableType);
        const distance = cable.properties.get('distance') || 0;
        const namePrefix = newName ? `${newName} - ` : '';
        cable.properties.set('balloonContent', `${namePrefix}${cableDescription}<br>Расстояние: ${distance} м`);
        saveData();
    }
}

function updateCablePreview(sourceObj, targetCoords) {
    if (!sourceObj || !sourceObj.geometry) {
        return;
    }
    
    const sourceCoords = sourceObj.geometry.getCoordinates();
    
    // Если координаты одинаковые, не создаем предпросмотр (нулевая длина)
    if (sourceCoords[0] === targetCoords[0] && sourceCoords[1] === targetCoords[1]) {
        // Используем координаты, немного смещенные от источника, чтобы линия была видна
        const zoom = myMap.getZoom();
        const offset = zoom < 12 ? 0.0001 : (zoom < 15 ? 0.00005 : 0.00002);
        targetCoords = [sourceCoords[0] + offset, sourceCoords[1] + offset];
    }
    
    // Получаем цвет и ширину кабеля из формы
    const cableType = document.getElementById('cableType').value;
    const cableDescription = getCableDescription(cableType);
    const cableWidth = getCableWidth(cableType);
    
    // Вычисляем расстояние для отображения
    const distance = calculateDistance(sourceCoords, targetCoords);
    const distanceKm = (distance / 1000).toFixed(2);
    
    // Если предпросмотр уже существует, обновляем его
    if (cablePreviewLine) {
        cablePreviewLine.geometry.setCoordinates([sourceCoords, targetCoords]);
        // Обновляем параметры предпросмотра (яркий синий, как в vols.expert)
        cablePreviewLine.options.set({
            strokeColor: '#3b82f6', // Яркий синий цвет для лучшей видимости предпросмотра
            strokeWidth: Math.max(cableWidth, 5), // Минимум 5px для видимости
            strokeOpacity: 0.9 // Немного прозрачный для красоты
        });
        // Обновляем balloon и hint с расстоянием
        const hintText = `${cableDescription}<br>Расстояние: ${distance} м (${distanceKm} км)`;
        cablePreviewLine.properties.set('balloonContent', hintText);
        cablePreviewLine.options.set('hintContent', hintText);
    } else {
        // Создаем новую временную линию предпросмотра (как в vols.expert)
        cablePreviewLine = new ymaps.Polyline([
            sourceCoords, targetCoords
        ], {
            balloonContent: `${cableDescription}<br>Расстояние: ${distance} м (${distanceKm} км)`
        }, {
            strokeColor: '#3b82f6', // Яркий синий цвет для лучшей видимости предпросмотра
            strokeWidth: Math.max(cableWidth, 5), // Минимум 5px для видимости
            strokeOpacity: 0.9, // Немного прозрачный для красоты
            strokeStyle: '12 6', // Более заметная пунктирная линия для предпросмотра
            zIndex: 1000,
            hasHint: true,
            hintContent: `${cableDescription}<br>Расстояние: ${distance} м (${distanceKm} км)`,
            interactive: false // Не интерактивный, чтобы не мешать кликам
        });
        
        myMap.geoObjects.add(cablePreviewLine);
    }
}

function removeCablePreview() {
    if (cablePreviewLine) {
        myMap.geoObjects.remove(cablePreviewLine);
        cablePreviewLine = null;
    }
    // Убираем подсветку при удалении предпросмотра
    if (hoveredObject) {
        clearHoverHighlight();
    }
}

function findObjectAtCoords(coords, tolerance = null) {
    // Уменьшенный tolerance для более точного выбора
    if (tolerance === null) {
        // Вычисляем tolerance на основе текущего масштаба карты
        const zoom = myMap.getZoom();
        // Чем больше зум, тем меньше tolerance (более точный выбор)
        tolerance = zoom < 12 ? 0.001 : (zoom < 15 ? 0.0005 : 0.00025);
    }
    
    // Сначала ищем объекты, которые точно попадают в область клика
    let foundObject = objects.find(obj => {
        if (obj && obj.geometry && obj.properties) {
            const objType = obj.properties.get('type');
            if (objType !== 'cable' && objType !== 'cableLabel') {
                try {
                    const objCoords = obj.geometry.getCoordinates();
                    const latDiff = Math.abs(objCoords[0] - coords[0]);
                    const lonDiff = Math.abs(objCoords[1] - coords[1]);
                    return latDiff < tolerance && lonDiff < tolerance;
                } catch (error) {
                    return false;
                }
            }
        }
        return false;
    });
    
    // Если не нашли точно, ищем ближайший объект в радиусе
    if (!foundObject) {
        let minDistance = Infinity;
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const objType = obj.properties.get('type');
                if (objType !== 'cable' && objType !== 'cableLabel') {
                    try {
                        const objCoords = obj.geometry.getCoordinates();
                        const latDiff = Math.abs(objCoords[0] - coords[0]);
                        const lonDiff = Math.abs(objCoords[1] - coords[1]);
                        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
                        
                        // Используем увеличенный tolerance для поиска ближайшего
                        if (distance < tolerance * 2 && distance < minDistance) {
                            minDistance = distance;
                            foundObject = obj;
                        }
                    } catch (error) {
                        // Игнорируем ошибки
                    }
                }
            }
        });
    }
    
    return foundObject || null;
}



function saveData() {
    const data = objects.map(obj => {
        const props = obj.properties.getAll();
        const geometry = obj.geometry.getCoordinates();
        
        if (props.type === 'cable') {
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: objects.indexOf(props.from),
                to: objects.indexOf(props.to),
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

function loadData() {
    const data = localStorage.getItem('networkMapData');
    if (data) {
        const parsedData = JSON.parse(data);
        importData(parsedData);
        // Убеждаемся, что все подписи узлов отображаются
        ensureNodeLabelsVisible();
        // Обновляем визуальные линии соединений кросс-узел
        updateAllNodeConnectionLines();
    }
}

function ensureNodeLabelsVisible() {
    // Проверяем все узлы и кроссы, убеждаемся что у них есть подписи
    objects.forEach(obj => {
        if (obj.properties) {
            const type = obj.properties.get('type');
            if (type === 'node' || type === 'cross') {
                const name = obj.properties.get('name') || '';
                // Всегда обновляем подпись, чтобы убедиться что она отображается
                updateNodeLabel(obj, name);
            }
        }
    });
}

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
                // Находим созданный кабель для обновления дополнительных свойств
                const cable = objects.find(obj => 
                    obj.properties && 
                    obj.properties.get('type') === 'cable' &&
                    obj.properties.get('uniqueId') === item.uniqueId
                );
                if (cable) {
                    // Обновляем расстояние для загруженного кабеля, если оно не было сохранено
                    if (!cable.properties.get('distance')) {
                        const fromCoords = fromObj.geometry.getCoordinates();
                        const toCoords = toObj.geometry.getCoordinates();
                        const distance = calculateDistance(fromCoords, toCoords);
                        cable.properties.set('distance', distance);
                        cable.properties.set('balloonContent', `${getCableDescription(item.cableType)}<br>Расстояние: ${distance} м`);
                    }
                    // Восстанавливаем название кабеля
                    if (item.cableName) {
                        cable.properties.set('cableName', item.cableName);
                    }
                }
            }
        }
    });
    
    // Убеждаемся, что все подписи узлов отображаются
    ensureNodeLabelsVisible();
    
    // Обновляем визуализацию кабелей (количество на линиях)
    updateCableVisualization();
    
    // Обновляем визуальные линии соединений кросс-узел
    updateAllNodeConnectionLines();
}


function createObjectFromData(data) {
    const { type, name, geometry, usedFibers, fiberConnections, fiberLabels, netboxId, netboxUrl, netboxDeviceType, netboxSite, sleeveType, maxFibers, crossPorts, nodeConnections, uniqueId } = data;
    
    let iconSvg, color, balloonContent;
    
    switch(type) {
        case 'support':
            // Опора связи - синий квадрат с закругленными углами
            color = '#3b82f6';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = 'Опора связи';
            break;
        case 'sleeve':
            // Кабельная муфта - красный шестиугольник
            color = '#ef4444';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = 'Кабельная муфта';
            break;
        case 'cross':
            // Оптический кросс - фиолетовый прямоугольник с портами
            color = '#8b5cf6';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="28" height="24" rx="3" fill="${color}" stroke="white" stroke-width="2"/>
                <line x1="10" y1="4" x2="10" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="16" y1="4" x2="16" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="22" y1="4" x2="22" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <circle cx="10" cy="12" r="2" fill="white"/>
                <circle cx="16" cy="12" r="2" fill="white"/>
                <circle cx="22" cy="12" r="2" fill="white"/>
                <circle cx="10" cy="20" r="2" fill="white"/>
                <circle cx="16" cy="20" r="2" fill="white"/>
                <circle cx="22" cy="20" r="2" fill="white"/>
            </svg>`;
            balloonContent = `Оптический кросс: ${name}`;
            break;
        case 'node':
            // Узел сети - зеленый круг с иконкой
            color = '#22c55e';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="${color}"/>
            </svg>`;
            balloonContent = `Узел сети: ${name}`;
            break;
        default:
            color = '#94a3b8';
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>`;
            balloonContent = 'Объект';
    }

    // Создаем SVG с увеличенной невидимой областью для удобства клика
    // Добавляем прозрачную область вокруг иконки
    const clickableSize = 36; // Область клика 36x36 пикселей
    const iconSize = (type === 'node' || type === 'cross') ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    // Извлекаем содержимое SVG без тегов svg
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2],
        draggable: isEditMode
    };
    
    const placemark = new ymaps.Placemark(geometry, {
        type: type,
        name: name,
        balloonContent: balloonContent
    }, placemarkOptions);
    
    // Для узлов и кроссов добавляем подпись с названием под маркером
    if (type === 'node' || type === 'cross') {
        const labelContent = name ? escapeHtml(name) : (type === 'cross' ? 'Оптический кросс' : 'Узел сети');
        const label = new ymaps.Placemark(geometry, {}, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: '<div style="color: #2c3e50; font-size: 12px; font-weight: 600; text-align: center; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9), 1px -1px 2px rgba(255,255,255,0.9), -1px 1px 2px rgba(255,255,255,0.9); padding: 2px 4px; margin-top: 8px; background: rgba(255,255,255,0.8); border-radius: 3px;">' + labelContent + '</div>',
            iconContentOffset: [0, 20],
            zIndex: 1000,
            zIndexHover: 1000,
            cursor: 'default',
            hasBalloon: false,
            hasHint: false
        });
        
        placemark.properties.set('label', label);
        myMap.geoObjects.add(label);
        
        // Обновляем позицию метки при перетаскивании
        placemark.events.add('dragend', function() {
            const coords = placemark.geometry.getCoordinates();
            if (label && label.geometry) {
                label.geometry.setCoordinates(coords);
            }
        });
    }
    
    // Восстанавливаем uniqueId объекта
    if (uniqueId) {
        placemark.properties.set('uniqueId', uniqueId);
    }
    
    // Восстанавливаем информацию об использованных жилах
    if (usedFibers) {
        placemark.properties.set('usedFibers', usedFibers);
    }
    
    // Восстанавливаем информацию о соединениях жил в муфте
    if (fiberConnections) {
        placemark.properties.set('fiberConnections', fiberConnections);
    }
    
    // Восстанавливаем подписи жил
    if (fiberLabels) {
        placemark.properties.set('fiberLabels', fiberLabels);
    }
    
    // Восстанавливаем настройки муфты
    if (type === 'sleeve') {
        if (sleeveType) {
            placemark.properties.set('sleeveType', sleeveType);
        }
        if (maxFibers !== undefined) {
            placemark.properties.set('maxFibers', maxFibers);
        }
    }
    
    // Восстанавливаем настройки кросса
    if (type === 'cross') {
        if (crossPorts) {
            placemark.properties.set('crossPorts', crossPorts);
        }
        // Восстанавливаем соединения с узлами
        if (nodeConnections) {
            placemark.properties.set('nodeConnections', nodeConnections);
        }
    }
    
    // Восстанавливаем информацию о NetBox
    if (netboxId) {
        placemark.properties.set('netboxId', netboxId);
    }
    if (netboxUrl) {
        placemark.properties.set('netboxUrl', netboxUrl);
    }
    if (netboxDeviceType) {
        placemark.properties.set('netboxDeviceType', netboxDeviceType);
    }
    if (netboxSite) {
        placemark.properties.set('netboxSite', netboxSite);
    }

    placemark.events.add('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); // Останавливаем всплытие события
        
        // Режим размещения объектов - игнорируем клик по существующим объектам
        if (objectPlacementMode) {
            return;
        }
        
        // Режим прокладки кабеля - обрабатываем выбор объектов
        if (currentCableTool && isEditMode) {
            // Узлы сети нельзя использовать для прокладки кабеля
            if (type === 'node') {
                alert('Узел сети нельзя использовать для прокладки кабеля!\n\nУзлы подключаются только через жилы оптического кросса.');
                return;
            }
            
            if (cableSource && cableSource !== placemark) {
                // Есть источник - создаем кабель от источника к кликнутому объекту
                const cableType = document.getElementById('cableType').value;
                const success = addCable(cableSource, placemark, cableType);
                if (success) {
                    // Кабель создан - новый источник = кликнутый объект (продолжаем цепочку)
                    cableSource = placemark;
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                }
            } else {
                // Нет источника или кликнули на тот же объект - устанавливаем как источник
                cableSource = placemark;
                clearSelection();
                selectObject(cableSource);
            }
            return;
        }
        
        // Для узлов, кроссов и муфт показываем информацию
        if ((type === 'node' || type === 'sleeve' || type === 'cross')) {
            showObjectInfo(placemark);
            return;
        }
        
        // В режиме просмотра не позволяем выделять объекты
        if (!isEditMode) {
            return;
        }
        
        if (selectedObjects.includes(placemark)) {
            deselectObject(placemark);
        } else {
            selectObject(placemark);
        }
    });

    placemark.events.add('dragend', function() {
        saveData();
        updateConnectedCables(placemark);
        // Обновляем позицию подписи, если она есть
        const label = placemark.properties.get('label');
        if (label) {
            label.geometry.setCoordinates(placemark.geometry.getCoordinates());
        }
        // Обновляем линии соединений кросс-узел
        updateAllNodeConnectionLines();
    });

    objects.push(placemark);
    myMap.geoObjects.add(placemark);
    updateStats();
    
    return placemark;
}

function exportData() {
    const data = objects.map(obj => {
        const props = obj.properties.getAll();
        const geometry = obj.geometry.getCoordinates();
        
        if (props.type === 'cable') {
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: objects.indexOf(props.from),
                to: objects.indexOf(props.to),
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

function clearMap() {
    myMap.geoObjects.removeAll();
    objects = [];
    selectedObjects = [];
    saveData();
    updateStats();
}

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

// Функции для работы с модальным окном
function showObjectInfo(obj) {
    currentModalObject = obj;
    const type = obj.properties.get('type');
    const name = obj.properties.get('name') || '';
    
    // Получаем все подключенные кабели
    const connectedCables = getConnectedCables(obj);
    
    // Определяем заголовок
    let title = '';
    if (type === 'node') {
        title = name ? `Узел сети: ${name}` : 'Узел сети';
    } else if (type === 'sleeve') {
        title = 'Кабельная муфта';
    } else if (type === 'cross') {
        title = name ? `Оптический кросс: ${name}` : 'Оптический кросс';
    }
    
    document.getElementById('modalTitle').textContent = title;
    
    // Формируем содержимое
    let html = '';
    
    // Добавляем информацию о муфте (всегда для муфт)
    if (type === 'sleeve') {
        const sleeveType = obj.properties.get('sleeveType') || 'Не указан';
        const maxFibers = obj.properties.get('maxFibers');
        const usedFibers = getTotalUsedFibersInSleeve(obj);
        
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">';
        html += '<h4 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 0.9375rem; font-weight: 600;">Информация о муфте</h4>';
        html += `<div style="color: #495057; font-size: 0.875rem; margin-bottom: 8px;"><strong>Тип муфты:</strong> ${escapeHtml(sleeveType)}</div>`;
        
        if (maxFibers !== undefined && maxFibers !== null && maxFibers > 0) {
            const usagePercent = Math.round((usedFibers / maxFibers) * 100);
            const isOverloaded = usedFibers > maxFibers;
            const statusColor = isOverloaded ? '#dc2626' : (usagePercent >= 80 ? '#f59e0b' : '#22c55e');
            
            html += `<div style="color: #495057; font-size: 0.875rem; margin-bottom: 8px;">`;
            html += `<strong>Вместимость:</strong> <span style="color: ${statusColor}; font-weight: 600;">${usedFibers}/${maxFibers} волокон</span> (${usagePercent}%)`;
            if (isOverloaded) {
                html += ` <span style="color: #dc2626; font-weight: 600;">⚠ Превышена вместимость!</span>`;
            }
            html += `</div>`;
        } else {
            html += `<div style="color: #495057; font-size: 0.875rem; margin-bottom: 8px;"><strong>Использовано волокон:</strong> ${usedFibers}</div>`;
        }
        
        html += '</div>';
        
        // Добавляем кнопку объединения кабелей для муфт (только в режиме редактирования)
        if (isEditMode && connectedCables.length > 1) {
            html += '<div style="margin-bottom: 15px; padding: 12px; background: #f0f9ff; border-radius: 6px; border: 1px solid #bae6fd;">';
            html += '<button id="mergeCablesBtn" class="btn-secondary" style="width: 100%;">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M8 17l4 4 4-4M12 2v19"></path></svg>';
            html += 'Объединить кабели</button>';
            html += '<small style="display: block; margin-top: 8px; color: #666; font-size: 11px;">Объединить несколько кабелей в один (например, 4×4 жилы = 16 жил)</small>';
            html += '</div>';
        }
    }
    
    // Обработка информации об узлах
    if (type === 'node') {
        const netboxId = obj.properties.get('netboxId');
        const netboxUrl = obj.properties.get('netboxUrl');
        const netboxDeviceType = obj.properties.get('netboxDeviceType');
        const netboxSite = obj.properties.get('netboxSite');
        
        // Секция редактирования для узлов (только в режиме редактирования)
        if (isEditMode) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">';
            html += '<h4 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 0.9375rem; font-weight: 600;">Редактирование узла</h4>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editNodeName" style="display: block; margin-bottom: 6px; color: #495057; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название узла</label>';
            html += `<input type="text" id="editNodeName" class="form-input" value="${escapeHtml(name)}" placeholder="Введите название узла" style="width: 100%; padding: 9px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.875rem;">`;
            html += '</div>';
            html += '<button id="saveNodeEdit" class="btn-primary" style="width: 100%; padding: 10px 14px; margin-top: 8px;">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 8px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
            html += 'Сохранить изменения</button>';
            html += '</div>';
        } else {
            // Если режим просмотра, показываем только информацию о названии узла
            html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">';
            html += '<h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 0.9375rem; font-weight: 600;">Информация</h4>';
            html += `<div style="color: #495057; font-size: 0.875rem;"><strong>Название узла:</strong> ${escapeHtml(name || 'Не указано')}</div>`;
            html += '</div>';
        }
        
        // Добавляем информацию о NetBox, если узел импортирован из NetBox (показываем всегда)
        if (netboxId) {
            html += '<div class="netbox-info" style="margin-bottom: 20px; padding: 15px; background: #e0f2fe; border-radius: 6px; border-left: 4px solid #3b82f6;">';
            html += '<h4 style="margin: 0 0 10px 0; color: #1e40af;">Информация из NetBox</h4>';
            html += '<div style="display: flex; flex-direction: column; gap: 5px;">';
            if (netboxDeviceType) {
                html += `<div><strong>Тип устройства:</strong> ${escapeHtml(netboxDeviceType)}</div>`;
            }
            if (netboxSite) {
                html += `<div><strong>Местоположение:</strong> ${escapeHtml(netboxSite)}</div>`;
            }
            if (netboxUrl) {
                html += `<div><strong>Ссылка:</strong> <a href="${escapeHtml(netboxUrl)}" target="_blank" style="color: #3b82f6; text-decoration: none;">Открыть в NetBox</a></div>`;
            }
            html += '</div></div>';
        }
        
        // Показываем подключенные жилы (от кроссов)
        // Получаем или создаём uniqueId для узла
        const nodeUniqueId = getObjectUniqueId(obj);
        const connectedFibers = getNodeConnectedFibers(nodeUniqueId);
        
        if (connectedFibers.length > 0) {
            html += '<div class="connected-fibers-section" style="margin-bottom: 20px; padding: 16px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">';
            html += '<h4 style="margin: 0 0 12px 0; color: #166534; font-size: 0.9375rem; font-weight: 600;">🔌 Подключенные жилы</h4>';
            html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
            
            connectedFibers.forEach((conn, index) => {
                html += `<div class="fiber-connection-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: white; border-radius: 4px; border: 1px solid #dcfce7;">`;
                html += `<div style="flex: 1;">`;
                html += `<div style="font-weight: 600; color: #166534;">Жила ${conn.fiberNumber}</div>`;
                html += `<div style="font-size: 0.8rem; color: #6b7280;">От кросса: ${escapeHtml(conn.crossName)}</div>`;
                if (conn.fiberLabel) {
                    html += `<div style="font-size: 0.75rem; color: #8b5cf6;">📝 ${escapeHtml(conn.fiberLabel)}</div>`;
                }
                html += `</div>`;
                html += `<button class="btn-trace-from-node" data-cross-id="${conn.crossUniqueId}" data-cable-id="${conn.cableId}" data-fiber-number="${conn.fiberNumber}" style="padding: 8px 12px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">🔍 Трассировка</button>`;
                html += `</div>`;
            });
            
            html += '</div></div>';
        } else {
            html += '<div style="margin-bottom: 20px; padding: 16px; background: #fef3c7; border-radius: 6px; border: 1px solid #fde68a;">';
            html += '<div style="color: #92400e; font-size: 0.875rem;">⚠️ К этому узлу не подключено ни одной жилы.</div>';
            html += '<div style="color: #a16207; font-size: 0.8rem; margin-top: 4px;">Подключите жилу через оптический кросс.</div>';
            html += '</div>';
        }
    }
    
    // Обработка информации о кроссах
    if (type === 'cross') {
        const crossPorts = obj.properties.get('crossPorts') || 24;
        
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">';
        html += '<h4 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 0.9375rem; font-weight: 600;">Информация о кроссе</h4>';
        html += `<div style="color: #495057; font-size: 0.875rem; margin-bottom: 8px;"><strong>Количество портов:</strong> ${crossPorts}</div>`;
        
        // Подсчитываем использованные порты
        const usedPorts = getTotalUsedFibersInSleeve(obj);
        const usagePercent = Math.round((usedPorts / crossPorts) * 100);
        const statusColor = usedPorts > crossPorts ? '#dc2626' : (usagePercent >= 80 ? '#f59e0b' : '#22c55e');
        
        html += `<div style="color: #495057; font-size: 0.875rem;"><strong>Использовано:</strong> <span style="color: ${statusColor}; font-weight: 600;">${usedPorts}/${crossPorts} портов</span> (${usagePercent}%)</div>`;
        html += '</div>';
        
        // Секция редактирования для кроссов (только в режиме редактирования)
        if (isEditMode) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">';
            html += '<h4 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 0.9375rem; font-weight: 600;">Редактирование кросса</h4>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editCrossName" style="display: block; margin-bottom: 6px; color: #495057; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название кросса</label>';
            html += `<input type="text" id="editCrossName" class="form-input" value="${escapeHtml(name)}" placeholder="Введите название кросса" style="width: 100%; padding: 9px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.875rem;">`;
            html += '</div>';
            html += '<button id="saveCrossEdit" class="btn-primary" style="width: 100%; padding: 10px 14px; margin-top: 8px;">';
            html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 8px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
            html += 'Сохранить изменения</button>';
            html += '</div>';
        }
    }
    
    // Добавляем кнопки управления объектом (только в режиме редактирования)
    if (isEditMode) {
        html += '<div class="object-actions-section" style="margin-bottom: 20px; display: flex; gap: 8px;">';
        html += '<button id="duplicateCurrentObject" class="btn-secondary" style="flex: 1;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        html += ' Дублировать</button>';
        html += '<button id="deleteCurrentObject" class="btn-danger" style="flex: 1;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        html += ' Удалить</button>';
        html += '</div>';
    }
    
    // Для всех объектов (включая муфты и кроссы) показываем информацию о подключенных кабелях
    if (connectedCables.length === 0) {
        html += '<div class="no-cables" style="padding: 15px; text-align: center; color: #6c757d; font-size: 0.875rem;">К этому объекту не подключено кабелей</div>';
    } else {
        // Для муфт и кроссов показываем визуальное объединение жил
        if ((type === 'sleeve' || type === 'cross') && connectedCables.length > 1) {
            html += renderFiberConnectionsVisualization(obj, connectedCables);
        } else if (type === 'cross' && connectedCables.length === 1) {
            // Для кросса с одним кабелем тоже показываем визуализацию с возможностью подключения к узлам
            html += renderFiberConnectionsVisualization(obj, connectedCables);
        } else {
            // Для других объектов или одной муфты с одним кабелем - обычное отображение
            connectedCables.forEach((cable, index) => {
                const cableType = cable.properties.get('cableType');
                const cableDescription = getCableDescription(cableType);
                const fibers = getFiberColors(cableType);
                // Получаем или создаем уникальный ID для кабеля
                let cableUniqueId = cable.properties.get('uniqueId');
                if (!cableUniqueId) {
                    cableUniqueId = `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    cable.properties.set('uniqueId', cableUniqueId);
                }
                
                html += `
                    <div class="cable-info" data-cable-id="${cableUniqueId}">
                        <div class="cable-header">
                            <h4>Кабель ${index + 1}: ${cableDescription}</h4>
                            <div class="cable-actions">
                                ${isEditMode ? `<select class="cable-type-select" data-cable-id="${cableUniqueId}">
                                    <option value="fiber4" ${cableType === 'fiber4' ? 'selected' : ''}>ВОЛС 4 жилы</option>
                                    <option value="fiber8" ${cableType === 'fiber8' ? 'selected' : ''}>ВОЛС 8 жил</option>
                                    <option value="fiber16" ${cableType === 'fiber16' ? 'selected' : ''}>ВОЛС 16 жил</option>
                                    <option value="fiber24" ${cableType === 'fiber24' ? 'selected' : ''}>ВОЛС 24 жилы</option>
                                    <option value="copper" ${cableType === 'copper' ? 'selected' : ''}>Медный кабель</option>
                                </select>` : `<span style="font-size: 0.875rem; color: #495057;">${cableDescription}</span>`}
                                ${isEditMode ? `<button class="btn-delete-cable" data-cable-id="${cableUniqueId}" title="Удалить кабель">✕</button>` : ''}
                            </div>
                        </div>
                        <div class="fibers-list">
                `;
                
                // Получаем информацию о использованных жилах для этого кабеля
                const usedFibers = getUsedFibers(obj, cableUniqueId);
                
                fibers.forEach((fiber, fiberIndex) => {
                    const isUsed = usedFibers.includes(fiber.number);
                    html += `
                        <div class="fiber-item ${isUsed ? 'fiber-used' : 'fiber-free'}" 
                             data-cable-id="${cableUniqueId}" 
                             data-fiber-number="${fiber.number}">
                            <div class="fiber-item-content">
                                <div class="fiber-color" style="background-color: ${fiber.color}; ${isUsed ? 'opacity: 0.5; border: 2px dashed #dc2626;' : ''}"></div>
                                <span class="fiber-label">Жила ${fiber.number}: ${fiber.name} ${isUsed ? '<span class="fiber-status">(используется)</span>' : '<span class="fiber-status fiber-free-text">(свободна)</span>'}</span>
                            </div>
                            ${!isUsed && isEditMode ? `<button class="btn-continue-cable" data-cable-id="${cableUniqueId}" data-fiber-number="${fiber.number}" title="Продолжить кабель с этой жилой">→</button>` : ''}
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });
        }
    }
    
    document.getElementById('modalInfo').innerHTML = html;
    
    // Добавляем обработчики событий для кнопок
    setupModalEventListeners();
    
    // Добавляем обработчики для редактирования и удаления
    setupEditAndDeleteListeners();
    
    // Показываем модальное окно
    const modal = document.getElementById('infoModal');
    modal.style.display = 'block';
}

function setupEditAndDeleteListeners() {
    // Обработчик сохранения редактирования узла
    const saveBtn = document.getElementById('saveNodeEdit');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            
            const newName = document.getElementById('editNodeName').value.trim();
            if (newName) {
                // Обновляем имя узла
                currentModalObject.properties.set('name', newName);
                currentModalObject.properties.set('balloonContent', `Узел сети: ${newName}`);
                
                // Обновляем подпись на карте
                updateNodeLabel(currentModalObject, newName);
                
                // Сохраняем данные
                saveData();
                
                // Обновляем модальное окно
                showObjectInfo(currentModalObject);
            }
        });
    }
    
    // Обработчик сохранения редактирования кросса
    const saveCrossBtn = document.getElementById('saveCrossEdit');
    if (saveCrossBtn) {
        saveCrossBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            
            const newName = document.getElementById('editCrossName').value.trim();
            if (newName) {
                // Обновляем имя кросса
                currentModalObject.properties.set('name', newName);
                currentModalObject.properties.set('balloonContent', `Оптический кросс: ${newName}`);
                
                // Обновляем подпись на карте
                updateNodeLabel(currentModalObject, newName);
                
                // Сохраняем данные
                saveData();
                
                // Обновляем модальное окно
                showObjectInfo(currentModalObject);
            }
        });
    }
    
    // Обработчик дублирования объекта
    const duplicateBtn = document.getElementById('duplicateCurrentObject');
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            
            duplicateObject(currentModalObject);
        });
    }
    
    // Обработчик объединения кабелей
    const mergeCablesBtn = document.getElementById('mergeCablesBtn');
    if (mergeCablesBtn) {
        mergeCablesBtn.addEventListener('click', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'sleeve') return;
            
            showMergeCablesDialog(currentModalObject);
        });
    }
    
    // Обработчик удаления объекта
    const deleteBtn = document.getElementById('deleteCurrentObject');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            
            if (confirm('Вы уверены, что хотите удалить этот объект?')) {
                deleteObject(currentModalObject);
                
                // Закрываем модальное окно
                const modal = document.getElementById('infoModal');
                modal.style.display = 'none';
                currentModalObject = null;
            }
        });
    }
}

function duplicateObject(obj) {
    if (!obj || !obj.geometry) return;
    
    const type = obj.properties.get('type');
    const name = obj.properties.get('name') || '';
    const coords = obj.geometry.getCoordinates();
    
    // Смещаем новый объект немного в сторону
    const offset = 0.0002; // Примерно 20 метров
    const newCoords = [coords[0] + offset, coords[1] + offset];
    
    // Для узлов добавляем "копия" к имени
    let newName = name;
    if (type === 'node' && name) {
        newName = name + ' (копия)';
    }
    
    // Создаем новый объект
    createObject(type, newName, newCoords);
    
    // Если есть информация о NetBox, копируем её
    const newNode = objects[objects.length - 1];
    const netboxId = obj.properties.get('netboxId');
    const netboxUrl = obj.properties.get('netboxUrl');
    const netboxDeviceType = obj.properties.get('netboxDeviceType');
    const netboxSite = obj.properties.get('netboxSite');
    
    if (netboxId && newNode) {
        newNode.properties.set('netboxId', null); // Убираем связь с NetBox для копии
        newNode.properties.set('netboxUrl', null);
    }
    
    // Закрываем модальное окно
    const modal = document.getElementById('infoModal');
    modal.style.display = 'none';
    currentModalObject = null;
}

function updateNodeLabel(placemark, name) {
    if (!placemark || !placemark.properties) return;
    
    const type = placemark.properties.get('type');
    if (type === 'node') {
        let label = placemark.properties.get('label');
        
        // Всегда показываем метку для узлов (даже если имя пустое)
        const displayName = name ? escapeHtml(name) : 'Узел сети';
        const coords = placemark.geometry.getCoordinates();
        
        if (!label) {
            // Создаем новую метку
            label = new ymaps.Placemark(coords, {}, {
                iconLayout: 'default#imageWithContent',
                iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
                iconImageSize: [1, 1],
                iconImageOffset: [0, 0],
                iconContent: '<div style="color: #2c3e50; font-size: 12px; font-weight: 600; text-align: center; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9), 1px -1px 2px rgba(255,255,255,0.9), -1px 1px 2px rgba(255,255,255,0.9); padding: 2px 4px; margin-top: 8px; background: rgba(255,255,255,0.8); border-radius: 3px;">' + displayName + '</div>',
                iconContentOffset: [0, 20],
                zIndex: 1000,
                zIndexHover: 1000,
                cursor: 'default',
                hasBalloon: false,
                hasHint: false
            });
            placemark.properties.set('label', label);
            myMap.geoObjects.add(label);
        } else {
            // Обновляем существующую метку
            label.properties.set({
                iconContent: '<div style="color: #2c3e50; font-size: 12px; font-weight: 600; text-align: center; white-space: nowrap; text-shadow: 1px 1px 2px rgba(255,255,255,0.9), -1px -1px 2px rgba(255,255,255,0.9), 1px -1px 2px rgba(255,255,255,0.9), -1px 1px 2px rgba(255,255,255,0.9); padding: 2px 4px; margin-top: 8px; background: rgba(255,255,255,0.8); border-radius: 3px;">' + displayName + '</div>'
            });
            label.geometry.setCoordinates(coords);
        }
    }
}

function setupModalEventListeners() {
    // Обработчики для удаления кабелей (только в режиме редактирования)
    if (isEditMode) {
        document.querySelectorAll('.btn-delete-cable').forEach(btn => {
            btn.addEventListener('click', function() {
                const cableUniqueId = this.getAttribute('data-cable-id');
                deleteCableByUniqueId(cableUniqueId);
            });
        });
        
        // Обработчики для изменения типа кабеля
        document.querySelectorAll('.cable-type-select').forEach(select => {
            select.addEventListener('change', function() {
                const cableUniqueId = this.getAttribute('data-cable-id');
                const newCableType = this.value;
                changeCableType(cableUniqueId, newCableType);
            });
        });
        
        // Обработчики для переключения состояния жил (только для использованных жил)
        document.querySelectorAll('.fiber-item.fiber-used').forEach(item => {
            item.addEventListener('click', function(e) {
                // Не обрабатываем клик, если кликнули на кнопку продолжения
                if (e.target.classList.contains('btn-continue-cable')) {
                    return;
                }
                const cableUniqueId = this.getAttribute('data-cable-id');
                const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
                toggleFiberUsage(cableUniqueId, fiberNumber);
            });
        });
        
        // Обработчики для продолжения кабеля
        document.querySelectorAll('.btn-continue-cable').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const cableUniqueId = this.getAttribute('data-cable-id');
                const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
                
                // Закрываем модальное окно
                const modal = document.getElementById('infoModal');
                modal.style.display = 'none';
                
                // Начинаем продолжение кабеля
                // Функционал продолжения кабеля удален - используйте последовательную прокладку
            });
        });
        
        // Обработчики для соединения жил в муфтах
        setupFiberConnectionHandlers();
    }
    
    // Обработчики для трассировки от узла сети
    document.querySelectorAll('.btn-trace-from-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const crossId = this.getAttribute('data-cross-id');
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            traceFromNode(crossId, cableId, fiberNumber);
        });
    });
}

// Настройка обработчиков для соединения жил в муфтах и кроссах
function setupFiberConnectionHandlers() {
    const objType = currentModalObject ? currentModalObject.properties.get('type') : null;
    if (!currentModalObject || (objType !== 'sleeve' && objType !== 'cross')) {
        return;
    }
    
    const sleeveObj = currentModalObject;
    let fiberConnections = sleeveObj.properties.get('fiberConnections');
    if (!fiberConnections) {
        fiberConnections = [];
        sleeveObj.properties.set('fiberConnections', fiberConnections);
    }
    
    // Сбрасываем выбранную жилу
    selectedFiberForConnection = null;
    
    // Обработчики кликов по жилам в SVG
    document.querySelectorAll('#fiber-connections-svg circle[id^="fiber-"]').forEach(circle => {
        circle.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            
            if (!selectedFiberForConnection) {
                // Проверяем, не подключена ли жила к узлу сети
                const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                const nodeConnKey = `${cableId}-${fiberNumber}`;
                if (nodeConnections[nodeConnKey]) {
                    // Жила подключена к узлу - показываем ошибку
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к узлу "${nodeConnections[nodeConnKey].nodeName}". Отключите её от узла, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                
                // Проверяем, не соединена ли уже эта жила с другой жилой
                const fiberAlreadyConnected = fiberConnections.find(conn => 
                    (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                    (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
                );
                
                if (fiberAlreadyConnected) {
                    // Жила уже соединена - показываем ошибку
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} кабеля ${cableId.substring(0, 8)}... уже соединена с другой жилой. Одна жила может быть соединена только с одной другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                
                // Выбираем первую жилу
                selectedFiberForConnection = { cableId, fiberNumber };
                this.setAttribute('stroke', '#f59e0b');
                this.setAttribute('stroke-width', '3');
                
                // Подсвечиваем инструкцию
                const instruction = document.querySelector('.fiber-connections-container');
                if (instruction) {
                    const existingMsg = instruction.querySelector('.connection-hint');
                    if (existingMsg) existingMsg.remove();
                    const hint = document.createElement('div');
                    hint.className = 'connection-hint';
                    hint.style.cssText = 'padding: 8px; background: #fef3c7; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #92400e;';
                    hint.textContent = `Выбрана жила ${fiberNumber} кабеля ${cableId.substring(0, 8)}... Теперь выберите вторую жилу для соединения.`;
                    instruction.appendChild(hint);
                }
            } else {
                // Выбираем вторую жилу и создаем соединение
                if (selectedFiberForConnection.cableId !== cableId || selectedFiberForConnection.fiberNumber !== fiberNumber) {
                    // Проверяем, не пытаемся ли соединить жилы одного кабеля
                    if (selectedFiberForConnection.cableId === cableId) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Нельзя соединить жилы одного кабеля. Выберите жилу из другого кабеля.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    
                    // Проверяем, не существует ли уже такое соединение
                    const existingConn = fiberConnections.find(conn => 
                        (conn.from.cableId === selectedFiberForConnection.cableId && conn.from.fiberNumber === selectedFiberForConnection.fiberNumber &&
                         conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) ||
                        (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber &&
                         conn.to.cableId === selectedFiberForConnection.cableId && conn.to.fiberNumber === selectedFiberForConnection.fiberNumber)
                    );
                    
                    // Проверяем, не подключена ли вторая жила к узлу сети
                    const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                    const nodeConnKey = `${cableId}-${fiberNumber}`;
                    if (nodeConnections[nodeConnKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к узлу "${nodeConnections[nodeConnKey].nodeName}". Отключите её от узла, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    
                    // Проверяем, не соединена ли уже первая жила с другой жилой
                    const firstFiberAlreadyConnected = fiberConnections.find(conn => 
                        (conn.from.cableId === selectedFiberForConnection.cableId && conn.from.fiberNumber === selectedFiberForConnection.fiberNumber) ||
                        (conn.to.cableId === selectedFiberForConnection.cableId && conn.to.fiberNumber === selectedFiberForConnection.fiberNumber)
                    );
                    
                    // Проверяем, не соединена ли уже вторая жила с другой жилой
                    const secondFiberAlreadyConnected = fiberConnections.find(conn => 
                        (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                        (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
                    );
                    
                    if (firstFiberAlreadyConnected) {
                        // Первая жила уже соединена - показываем ошибку
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${selectedFiberForConnection.fiberNumber} кабеля ${selectedFiberForConnection.cableId.substring(0, 8)}... уже соединена с другой жилой. Одна жила может быть соединена только с одной другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    
                    if (secondFiberAlreadyConnected) {
                        // Вторая жила уже соединена - показываем ошибку
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} кабеля ${cableId.substring(0, 8)}... уже соединена с другой жилой. Одна жила может быть соединена только с одной другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    
                    if (!existingConn) {
                        // Добавляем новое соединение
                        fiberConnections.push({
                            from: { cableId: selectedFiberForConnection.cableId, fiberNumber: selectedFiberForConnection.fiberNumber },
                            to: { cableId: cableId, fiberNumber: fiberNumber }
                        });
                        sleeveObj.properties.set('fiberConnections', fiberConnections);
                        saveData();
                        
                        // Обновляем модальное окно
                        showObjectInfo(sleeveObj);
                        return;
                    }
                }
                
                // Сбрасываем выделение
                resetFiberSelection();
            }
        });
    });
    
    // Обработчики кликов по соединениям для удаления
    document.querySelectorAll('#fiber-connections-svg path[id^="connection-"], #fiber-connections-svg polygon[data-connection-index]').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            const connIndex = parseInt(this.getAttribute('data-connection-index'));
            if (connIndex >= 0 && connIndex < fiberConnections.length) {
                fiberConnections.splice(connIndex, 1);
                sleeveObj.properties.set('fiberConnections', fiberConnections);
                saveData();
                showObjectInfo(sleeveObj);
            }
        });
    });
    
    // Обработчики изменения подписей жил
    document.querySelectorAll('.fiber-label-input').forEach(input => {
        input.addEventListener('change', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            const newLabel = this.value.trim();
            
            updateFiberLabel(sleeveObj, cableId, fiberNumber, newLabel);
        });
    });
    
    // Обработчики подключения к узлу (для кроссов)
    document.querySelectorAll('.btn-connect-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showNodeSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });
    
    // Обработчики отключения от узла
    document.querySelectorAll('.btn-disconnect-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromNode(sleeveObj, cableId, fiberNumber);
        });
    });
}

// Обновление подписи жилы
function updateFiberLabel(sleeveObj, cableId, fiberNumber, label) {
    let fiberLabels = sleeveObj.properties.get('fiberLabels');
    if (!fiberLabels) {
        fiberLabels = {};
    }
    
    const key = `${cableId}-${fiberNumber}`;
    if (label) {
        fiberLabels[key] = label;
    } else {
        delete fiberLabels[key];
    }
    
    sleeveObj.properties.set('fiberLabels', fiberLabels);
    saveData();
}

// ==================== Трассировка жил ====================

// Получает уникальный ID объекта (создаёт если нет)
function getObjectUniqueId(obj) {
    if (!obj || !obj.properties) return null;
    let id = obj.properties.get('uniqueId');
    if (!id) {
        const type = obj.properties.get('type') || 'obj';
        id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        obj.properties.set('uniqueId', id);
    }
    return id;
}

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
        
        // Сначала пробуем сравнить по ссылке
        if (fromObj === currentObj) {
            return toObj;
        } else if (toObj === currentObj) {
            return fromObj;
        }
        
        // Затем сравниваем по uniqueId
        const currentId = getObjectUniqueId(currentObj);
        const fromId = getObjectUniqueId(fromObj);
        const toId = getObjectUniqueId(toObj);
        
        if (fromId === currentId) {
            return toObj;
        } else if (toId === currentId) {
            return fromObj;
        }
        
        // Если не нашли по ID, сравниваем по координатам
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
        
        // Проверяем, не зациклились ли мы
        if (visitedObjects.has(nextObjectId)) break;
        visitedObjects.add(nextObjectId);
        
        const objType = nextObject.properties.get('type');
        const objName = nextObject.properties.get('name') || getObjectTypeName(objType);
        
        // Добавляем следующий объект в путь
        path.push({
            type: 'object',
            objectType: objType,
            objectName: objName,
            object: nextObject
        });
        
        // Если это муфта или кросс - ищем соединение с другой жилой
        if (objType === 'sleeve' || objType === 'cross') {
            // Для кросса проверяем подключение к узлу
            if (objType === 'cross') {
                const nodeConnections = nextObject.properties.get('nodeConnections') || {};
                const nodeConnKey = `${currentCableId}-${currentFiberNumber}`;
                const nodeConn = nodeConnections[nodeConnKey];
                
                if (nodeConn) {
                    // Жила подключена к узлу - добавляем узел в путь и завершаем
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
            
            // Проверяем, не проходили ли мы эту жилу
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);
            
            // Ищем соединение с другой жилой
            const nextFiber = findFiberConnection(currentCableId, currentFiberNumber, nextObject);
            
            if (!nextFiber) {
                // Соединение не найдено - конец трассы
                break;
            }
            
            // Находим следующий кабель
            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;
            
            // Добавляем соединение в путь
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
            
            // Обновляем текущее состояние
            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;
            currentObject = nextObject;
            
        } else if (objType === 'support') {
            // Опора - ищем следующий кабель, проходящий через неё
            const nextCableForSupport = findNextCableThroughObject(nextObject, currentCable);
            
            if (!nextCableForSupport) {
                // Нет следующего кабеля - конец трассы
                break;
            }
            
            // Продолжаем с тем же номером жилы
            currentCable = nextCableForSupport;
            currentCableId = nextCableForSupport.properties.get('uniqueId');
            currentObject = nextObject;
            // currentFiberNumber остаётся тем же
            
        } else {
            // Узел или другой тип - конец трассы
            break;
        }
    }
    
    // Вспомогательная функция для поиска следующего кабеля через объект
    function findNextCableThroughObject(obj, excludeCable) {
        const objCoords = obj.geometry ? obj.geometry.getCoordinates() : null;
        const objId = getObjectUniqueId(obj);
        const excludeId = excludeCable ? excludeCable.properties.get('uniqueId') : null;
        
        // Ищем другой кабель, подключенный к этому объекту
        for (const cable of objects) {
            if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
            
            const cableId = cable.properties.get('uniqueId');
            if (excludeId && cableId === excludeId) continue;
            
            const fromObj = cable.properties.get('from');
            const toObj = cable.properties.get('to');
            
            if (!fromObj || !toObj) continue;
            
            // Проверяем по ссылке
            if (fromObj === obj || toObj === obj) {
                return cable;
            }
            
            // Проверяем по uniqueId
            const fromId = getObjectUniqueId(fromObj);
            const toId = getObjectUniqueId(toObj);
            
            if (objId && (fromId === objId || toId === objId)) {
                return cable;
            }
            
            // Проверяем по координатам
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
    
    return { path, error: null };
}

// Находит все соединённые жилы через муфты
function traceFiberPath(startCableId, startFiberNumber) {
    const path = [];
    const visitedFibers = new Set();
    const visitedObjects = new Set();
    
    // Функция для поиска следующего соединения в муфте/кроссе
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
    
    // Находим кабель по ID
    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }
    
    // Находим другой конец кабеля (не равный данному объекту)
    function getOtherEnd(cable, currentObj) {
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        
        if (!fromObj || !toObj) return null;
        
        // Сначала пробуем сравнить по ссылке
        if (fromObj === currentObj) {
            return toObj;
        } else if (toObj === currentObj) {
            return fromObj;
        }
        
        // Затем сравниваем по uniqueId
        const currentId = getObjectUniqueId(currentObj);
        const fromId = getObjectUniqueId(fromObj);
        const toId = getObjectUniqueId(toObj);
        
        if (fromId === currentId) {
            return toObj;
        } else if (toId === currentId) {
            return fromObj;
        }
        
        // Если не нашли по ID, сравниваем по координатам
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
    
    // Находим начальный кабель
    const startCable = findCableById(startCableId);
    if (!startCable) return { path: [], error: 'Кабель не найден' };
    
    // Начинаем трассировку
    let currentCableId = startCableId;
    let currentFiberNumber = startFiberNumber;
    let currentCable = startCable;
    
    // Добавляем начальную точку
    const fromObj = currentCable.properties.get('from');
    const toObj = currentCable.properties.get('to');
    const cableName = currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType'));
    
    path.push({
        type: 'start',
        objectType: fromObj.properties.get('type'),
        objectName: fromObj.properties.get('name') || getObjectTypeName(fromObj.properties.get('type')),
        object: fromObj
    });
    
    path.push({
        type: 'cable',
        cableId: currentCableId,
        cableName: cableName,
        fiberNumber: currentFiberNumber,
        cable: currentCable
    });
    
    // Продолжаем трассировку через муфты
    let currentObject = toObj;
    const maxIterations = 100;
    let iterations = 0;
    
    while (iterations < maxIterations) {
        iterations++;
        
        if (!currentObject) break;
        
        const currentObjectId = getObjectUniqueId(currentObject);
        
        // Проверяем, не зациклились ли мы
        if (visitedObjects.has(currentObjectId)) break;
        visitedObjects.add(currentObjectId);
        
        const objType = currentObject.properties.get('type');
        const objName = currentObject.properties.get('name') || getObjectTypeName(objType);
        
        path.push({
            type: 'object',
            objectType: objType,
            objectName: objName,
            object: currentObject
        });
        
        // Если это муфта или кросс, ищем соединение с другой жилой
        if (objType === 'sleeve' || objType === 'cross') {
            // Для кросса сначала проверяем подключение к узлу
            if (objType === 'cross') {
                const nodeConnections = currentObject.properties.get('nodeConnections') || {};
                const nodeConnKey = `${currentCableId}-${currentFiberNumber}`;
                const nodeConn = nodeConnections[nodeConnKey];
                
                if (nodeConn) {
                    // Жила подключена к узлу - добавляем узел в путь и завершаем
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
                            cross: currentObject
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
            
            // Проверяем, не проходили ли мы уже эту жилу
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);
            
            // Ищем соединение с другой жилой
            const nextFiber = findFiberConnection(currentCableId, currentFiberNumber, currentObject);
            
            if (!nextFiber) {
                // Соединение не найдено - конец трассы в этой муфте
                break;
            }
            
            // Находим следующий кабель
            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;
            
            // Добавляем соединение в путь
            const fiberLabels = currentObject.properties.get('fiberLabels') || {};
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
                sleeve: currentObject
            });
            
            // Обновляем текущий кабель и жилу
            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;
            
            // Добавляем кабель в путь
            const nextCableName = nextCable.properties.get('cableName') || getCableDescription(nextCable.properties.get('cableType'));
            path.push({
                type: 'cable',
                cableId: currentCableId,
                cableName: nextCableName,
                fiberNumber: currentFiberNumber,
                cable: nextCable
            });
            
            // Определяем следующий объект (другой конец кабеля)
            const nextObject = getOtherEnd(nextCable, currentObject);
            
            if (!nextObject) {
                // Не удалось определить следующий объект
                break;
            }
            
            currentObject = nextObject;
        } else if (objType === 'support') {
            // Опора - ищем следующий кабель, проходящий через неё
            const nextCableForSupport = findNextCableThroughSupport(currentObject, currentCable);
            
            if (!nextCableForSupport) {
                // Нет следующего кабеля - конец трассы
                break;
            }
            
            // Добавляем следующий кабель в путь
            const supportNextCableName = nextCableForSupport.properties.get('cableName') || getCableDescription(nextCableForSupport.properties.get('cableType'));
            const supportNextCableId = nextCableForSupport.properties.get('uniqueId');
            
            path.push({
                type: 'cable',
                cableId: supportNextCableId,
                cableName: supportNextCableName,
                fiberNumber: currentFiberNumber,
                cable: nextCableForSupport
            });
            
            // Находим следующий объект
            const nextObjectAfterSupport = getOtherEnd(nextCableForSupport, currentObject);
            
            if (!nextObjectAfterSupport) {
                break;
            }
            
            currentCable = nextCableForSupport;
            currentCableId = supportNextCableId;
            currentObject = nextObjectAfterSupport;
            // currentFiberNumber остаётся тем же
            
        } else {
            // Узел или другой тип - конец трассы
            break;
        }
    }
    
    // Вспомогательная функция для поиска следующего кабеля через опору
    function findNextCableThroughSupport(supportObj, excludeCable) {
        const supportCoords = supportObj.geometry ? supportObj.geometry.getCoordinates() : null;
        const supportId = getObjectUniqueId(supportObj);
        const excludeId = excludeCable ? excludeCable.properties.get('uniqueId') : null;
        
        for (const cable of objects) {
            if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
            
            const cableId = cable.properties.get('uniqueId');
            if (excludeId && cableId === excludeId) continue;
            
            const fromObj = cable.properties.get('from');
            const toObj = cable.properties.get('to');
            
            if (!fromObj || !toObj) continue;
            
            // Проверяем по ссылке
            if (fromObj === supportObj || toObj === supportObj) {
                return cable;
            }
            
            // Проверяем по uniqueId
            const fromId = getObjectUniqueId(fromObj);
            const toId = getObjectUniqueId(toObj);
            
            if (supportId && (fromId === supportId || toId === supportId)) {
                return cable;
            }
            
            // Проверяем по координатам
            if (supportCoords) {
                const fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
                const toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
                
                if (fromCoords && Math.abs(fromCoords[0] - supportCoords[0]) < 0.0001 && Math.abs(fromCoords[1] - supportCoords[1]) < 0.0001) {
                    return cable;
                }
                if (toCoords && Math.abs(toCoords[0] - supportCoords[0]) < 0.0001 && Math.abs(toCoords[1] - supportCoords[1]) < 0.0001) {
                    return cable;
                }
            }
        }
        
        return null;
    }
    
    return { path, iterations };
}

// Получает название типа объекта
function getObjectTypeName(type) {
    switch (type) {
        case 'support': return 'Опора связи';
        case 'sleeve': return 'Кабельная муфта';
        case 'cross': return 'Оптический кросс';
        case 'node': return 'Узел сети';
        default: return 'Объект';
    }
}

// Показывает модальное окно с результатами трассировки
function showFiberTrace(cableId, fiberNumber) {
    const result = traceFiberPath(cableId, fiberNumber);
    
    if (result.error) {
        alert('Ошибка трассировки: ' + result.error);
        return;
    }
    
    const path = result.path;
    
    // Создаем модальное окно с результатами
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalInfo');
    
    if (!modal || !modalContent) return;
    
    modalTitle.textContent = 'Трассировка жилы';
    
    let html = '<div class="trace-result" style="padding: 10px;">';
    html += '<div style="background: #e0f2fe; padding: 12px; border-radius: 8px; margin-bottom: 15px;">';
    html += '<strong>Маршрут жилы:</strong>';
    html += '</div>';
    
    html += '<div class="trace-path" style="position: relative; padding-left: 20px;">';
    
    // Отрисовываем путь
    path.forEach((item, index) => {
        const isLast = index === path.length - 1;
        
        if (item.type === 'start' || item.type === 'object') {
            // Объект (начало/конец/промежуточный)
            let icon = '📍';
            let color = '#6b7280';
            if (item.objectType === 'sleeve') {
                icon = '🔗';
                color = '#ef4444';
            } else if (item.objectType === 'cross') {
                icon = '📦';
                color = '#8b5cf6';
            } else if (item.objectType === 'node') {
                icon = '🖥️';
                color = '#22c55e';
            } else if (item.objectType === 'support') {
                icon = '📡';
                color = '#3b82f6';
            }
            
            html += `<div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: ${isLast ? '0' : '8px'};">`;
            html += `<div style="width: 32px; height: 32px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px;">${icon}</div>`;
            html += `<div style="flex: 1; padding-top: 4px;">`;
            html += `<strong style="color: ${color};">${item.objectName}</strong>`;
            html += `<div style="font-size: 0.8rem; color: #6b7280;">${getObjectTypeName(item.objectType)}</div>`;
            html += `</div></div>`;
        } else if (item.type === 'nodeConnection') {
            // Подключение к узлу (от кросса)
            html += `<div style="display: flex; align-items: center; gap: 4px; margin: 4px 0 4px 24px; font-size: 0.8rem; color: #22c55e;">`;
            html += `<span>🔌 Вывод на узел:</span>`;
            html += `<span style="background: #dcfce7; padding: 2px 6px; border-radius: 4px;">Жила ${item.fiberNumber} → ${item.nodeName}</span>`;
            html += `</div>`;
        } else if (item.type === 'cable') {
            // Кабель
            const fiberColors = getFiberColors(item.cable.properties.get('cableType'));
            const fiber = fiberColors.find(f => f.number === item.fiberNumber);
            const fiberColor = fiber ? fiber.color : '#888';
            const fiberName = fiber ? fiber.name : `Жила ${item.fiberNumber}`;
            
            html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0 4px 12px; padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid ${fiberColor};">`;
            html += `<span style="font-size: 0.875rem;">📦 <strong>${item.cableName}</strong></span>`;
            html += `<span style="background: ${fiberColor}; color: ${fiberColor === '#FFFFFF' || fiberColor === '#FFFACD' ? '#000' : '#fff'}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Жила ${item.fiberNumber}: ${fiberName}</span>`;
            html += `</div>`;
        } else if (item.type === 'connection') {
            // Соединение в муфте
            html += `<div style="display: flex; align-items: center; gap: 4px; margin: 4px 0 4px 24px; font-size: 0.8rem; color: #6366f1;">`;
            html += `<span>↔️ Соединение:</span>`;
            html += `<span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">Жила ${item.fromFiberNumber}</span>`;
            if (item.fromLabel) html += `<span style="color: #9ca3af;">[${item.fromLabel}]</span>`;
            html += `<span>⟷</span>`;
            html += `<span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">Жила ${item.toFiberNumber}</span>`;
            if (item.toLabel) html += `<span style="color: #9ca3af;">[${item.toLabel}]</span>`;
            html += `</div>`;
        }
    });
    
    html += '</div>';
    
    // Кнопка для подсветки на карте
    html += '<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">';
    html += `<button onclick="highlightTracePath()" class="btn-primary" style="width: 100%;">`;
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">';
    html += '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    html += '</svg>Показать на карте</button>';
    html += '</div>';
    
    html += '</div>';
    
    modalContent.innerHTML = html;
    modal.style.display = 'block';
    
    // Сохраняем путь для подсветки
    window.currentTracePath = path;
}

// Подсветка трассы на карте
let traceHighlightObjects = [];

function highlightTracePath() {
    // Очищаем предыдущую подсветку
    clearTraceHighlight();
    
    const path = window.currentTracePath;
    if (!path || path.length === 0) return;
    
    // Собираем координаты для подсветки
    path.forEach(item => {
        if (item.type === 'cable' && item.cable) {
            // Подсвечиваем кабель
            const coords = item.cable.geometry.getCoordinates();
            const highlightLine = new ymaps.Polyline(coords, {}, {
                strokeColor: '#f59e0b',
                strokeWidth: 8,
                strokeOpacity: 0.7,
                zIndex: 1500
            });
            traceHighlightObjects.push(highlightLine);
            myMap.geoObjects.add(highlightLine);
        } else if ((item.type === 'start' || item.type === 'object') && item.object) {
            // Подсвечиваем объект
            const coords = item.object.geometry.getCoordinates();
            const highlightCircle = new ymaps.Circle([coords, 30], {}, {
                fillColor: '#f59e0b',
                fillOpacity: 0.5,
                strokeColor: '#f59e0b',
                strokeWidth: 3,
                zIndex: 1500
            });
            traceHighlightObjects.push(highlightCircle);
            myMap.geoObjects.add(highlightCircle);
        }
    });
    
    // Центрируем карту на трассе
    if (traceHighlightObjects.length > 0) {
        const bounds = [];
        path.forEach(item => {
            if (item.object && item.object.geometry) {
                bounds.push(item.object.geometry.getCoordinates());
            } else if (item.cable && item.cable.geometry) {
                const coords = item.cable.geometry.getCoordinates();
                if (Array.isArray(coords[0])) {
                    coords.forEach(c => bounds.push(c));
                } else {
                    bounds.push(coords);
                }
            }
        });
        
        if (bounds.length > 0) {
            myMap.setBounds(ymaps.util.bounds.fromPoints(bounds), {
                checkZoomRange: true,
                zoomMargin: 50
            });
        }
    }
    
    // Автоматически очищаем подсветку через 10 секунд
    setTimeout(clearTraceHighlight, 10000);
}

function clearTraceHighlight() {
    traceHighlightObjects.forEach(obj => {
        myMap.geoObjects.remove(obj);
    });
    traceHighlightObjects = [];
}

// ==================== Соединения кросс-узел ====================

// Массив для хранения визуальных линий соединений кросс-узел
let nodeConnectionLines = [];

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
    
    // Создаем простой диалог выбора
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
    
    // Создаем визуальную линию соединения
    createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber);
    
    saveData();
    
    // Обновляем модальное окно
    showObjectInfo(crossObj);
}

// Отключает жилу от узла
function disconnectFiberFromNode(crossObj, cableId, fiberNumber) {
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) return;
    
    const key = `${cableId}-${fiberNumber}`;
    
    // Удаляем визуальную линию
    removeNodeConnectionLine(crossObj, cableId, fiberNumber);
    
    delete nodeConnections[key];
    
    crossObj.properties.set('nodeConnections', nodeConnections);
    saveData();
    
    // Обновляем модальное окно
    showObjectInfo(crossObj);
}

// Создает визуальную линию соединения кросс-узел
function createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber) {
    const crossCoords = crossObj.geometry.getCoordinates();
    const nodeCoords = nodeObj.geometry.getCoordinates();
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;
    
    // Удаляем старую линию, если есть
    removeNodeConnectionLineByKey(key);
    
    // Создаем пунктирную линию соединения
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
    // Удаляем все существующие линии
    nodeConnectionLines.forEach(line => {
        myMap.geoObjects.remove(line);
    });
    nodeConnectionLines = [];
    
    // Проходим по всем кроссам и создаем линии
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cross') {
            const nodeConnections = obj.properties.get('nodeConnections');
            if (nodeConnections) {
                Object.keys(nodeConnections).forEach(key => {
                    const [cableId, fiberNumber] = key.split('-').slice(0, -1).join('-').split('-');
                    const fiberNum = parseInt(key.split('-').pop());
                    const conn = nodeConnections[key];
                    
                    // Находим узел по ID
                    const nodeObj = objects.find(n => 
                        n.properties && 
                        n.properties.get('type') === 'node' &&
                        n.properties.get('uniqueId') === conn.nodeId
                    );
                    
                    if (nodeObj) {
                        // Парсим ключ правильно (cableId может содержать дефисы)
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

// Генерирует уникальный ID
function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Получает все жилы, подключенные к узлу
function getNodeConnectedFibers(nodeUniqueId) {
    const connectedFibers = [];
    
    if (!nodeUniqueId) return connectedFibers;
    
    // Проходим по всем кроссам и ищем соединения с этим узлом
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
                        // Парсим ключ (cableId-fiberNumber)
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

// Трассировка от узла сети
function traceFromNode(crossUniqueId, cableId, fiberNumber) {
    // Находим кросс
    const crossObj = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cross' &&
        obj.properties.get('uniqueId') === crossUniqueId
    );
    
    if (!crossObj) {
        alert('Кросс не найден');
        return;
    }
    
    // Находим узел, к которому подключена эта жила
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
    
    // Запускаем трассировку от кросса (начальная точка - кросс, направление - от узла)
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
    
    // Отображаем результат в модальном окне
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('modalTitle');
    const content = document.getElementById('modalInfo');
    
    title.textContent = `🔍 Трассировка жилы ${fiberNumber}`;
    
    let html = '<div class="trace-path" style="padding: 10px;">';
    html += '<h4 style="margin: 0 0 16px 0; color: #1e40af; font-size: 1rem; font-weight: 600;">📍 Путь жилы:</h4>';
    
    // Если есть узел, добавляем его в начало пути
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
        
        // Добавляем стрелку соединения узел → кросс
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
    
    // Итоговая статистика
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

// Сброс выделения жилы
function resetFiberSelection() {
    selectedFiberForConnection = null;
    document.querySelectorAll('#fiber-connections-svg circle[id^="fiber-"]').forEach(c => {
        const isUsed = c.getAttribute('data-fiber-used') === 'true';
        const isConnected = c.getAttribute('data-fiber-connected') === 'true';
        
        if (isConnected) {
            c.setAttribute('stroke', '#3b82f6');
            c.setAttribute('stroke-width', '3');
        } else if (isUsed) {
            c.setAttribute('stroke', '#dc2626');
            c.setAttribute('stroke-width', '2');
        } else {
            c.setAttribute('stroke', '#333');
            c.setAttribute('stroke-width', '1');
        }
    });
    
    // Убираем подсказку
    const hint = document.querySelector('.connection-hint');
    if (hint) hint.remove();
}

function deleteCableByUniqueId(cableUniqueId) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (!cable) return;
    
    // Удаляем без подтверждения (подтверждение уже было при клике на кнопку)
    // Удаляем информацию об использованных жилах из связанных объектов
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    
    if (fromObj) {
        removeCableFromUsedFibers(fromObj, cableUniqueId);
    }
    if (toObj) {
        removeCableFromUsedFibers(toObj, cableUniqueId);
    }
    
    myMap.geoObjects.remove(cable);
    objects = objects.filter(o => o !== cable);
    
    // Обновляем визуализацию кабелей (количество на линиях)
    updateCableVisualization();
    
    // Закрываем модальное окно, если оно открыто для этого кабеля
    const modal = document.getElementById('infoModal');
    if (modal && currentModalObject === cable) {
        modal.style.display = 'none';
        currentModalObject = null;
    }
    
    saveData();
    updateStats();
    
    // Обновляем модальное окно, если оно открыто для другого объекта
    if (currentModalObject && currentModalObject !== cable) {
        if (currentModalObject.properties) {
            const objType = currentModalObject.properties.get('type');
            if (objType !== 'cable') {
                showObjectInfo(currentModalObject);
            }
        }
    }
}

function removeCableFromUsedFibers(obj, cableUniqueId) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (usedFibersData && usedFibersData[cableUniqueId]) {
        delete usedFibersData[cableUniqueId];
        obj.properties.set('usedFibers', usedFibersData);
        saveData();
    }
}

function changeCableType(cableUniqueId, newCableType) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (!cable) return;
    
    const oldCableType = cable.properties.get('cableType');
    const oldFiberCount = getFiberCount(oldCableType);
    const newFiberCount = getFiberCount(newCableType);
    
    // Если количество жил изменилось, очищаем использованные жилы, которые больше не существуют
    if (newFiberCount < oldFiberCount) {
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        
        [fromObj, toObj].forEach(obj => {
            if (obj) {
                let usedFibersData = obj.properties.get('usedFibers');
                if (usedFibersData && usedFibersData[cableUniqueId]) {
                    // Оставляем только жилы, которые существуют в новом типе кабеля
                    usedFibersData[cableUniqueId] = usedFibersData[cableUniqueId].filter(
                        fiberNum => fiberNum <= newFiberCount
                    );
                    obj.properties.set('usedFibers', usedFibersData);
                }
            }
        });
    }
    
    // Обновляем тип кабеля
    cable.properties.set('cableType', newCableType);
    
    // Обновляем визуальное отображение кабеля
    const cableColor = getCableColor(newCableType);
    const cableWidth = getCableWidth(newCableType);
    
    cable.options.set({
        strokeColor: cableColor,
        strokeWidth: cableWidth,
        strokeOpacity: 0.8
    });
    
    // Обновляем balloon
    const cableDescription = getCableDescription(newCableType);
    cable.properties.set('balloonContent', cableDescription);
    
    saveData();
    
    // Обновляем модальное окно
    if (currentModalObject) {
        showObjectInfo(currentModalObject);
    }
}

function getFiberCount(cableType) {
    switch(cableType) {
        case 'fiber4': return 4;
        case 'fiber8': return 8;
        case 'fiber16': return 16;
        case 'fiber24': return 24;
        case 'copper': return 4;
        default: return 0;
    }
}

function getConnectedCables(obj) {
    return objects.filter(cable => 
        cable.properties && 
        cable.properties.get('type') === 'cable' &&
        (cable.properties.get('from') === obj || cable.properties.get('to') === obj)
    );
}

// Получает общее количество использованных волокон в муфте
function getTotalUsedFibersInSleeve(sleeveObj) {
    if (!sleeveObj || !sleeveObj.properties || sleeveObj.properties.get('type') !== 'sleeve') {
        return 0;
    }
    
    // Подсчитываем количество кабелей, подключенных к муфте
    // Считаем все жилы всех кабелей, подключенных к муфте
    let totalFibers = 0;
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');
            
            // Если кабель подключен к этой муфте
            if ((fromObj && fromObj === sleeveObj) || (toObj && toObj === sleeveObj)) {
                const cableType = obj.properties.get('cableType');
                const fiberCount = getFiberCount(cableType);
                totalFibers += fiberCount;
            }
        }
    });
    
    return totalFibers;
}

// Группируем кабели по парам объектов (от и до)
function getCableGroups() {
    const groups = new Map();
    
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');
            
            if (fromObj && toObj) {
                // Создаем уникальный ключ для пары объектов
                // Используем сами объекты, но упорядочиваем их для консистентности
                const fromCoords = fromObj.geometry.getCoordinates();
                const toCoords = toObj.geometry.getCoordinates();
                
                // Сортируем координаты для создания уникального ключа (независимо от направления)
                const sorted = [fromCoords, toCoords].sort((a, b) => {
                    if (Math.abs(a[0] - b[0]) > 0.000001) return a[0] - b[0];
                    return a[1] - b[1];
                });
                
                const key = `${sorted[0][0].toFixed(8)},${sorted[0][1].toFixed(8)}|${sorted[1][0].toFixed(8)},${sorted[1][1].toFixed(8)}`;
                
                if (!groups.has(key)) {
                    groups.set(key, {
                        from: fromObj,
                        to: toObj,
                        fromCoords: fromCoords,
                        toCoords: toCoords,
                        cables: []
                    });
                }
                groups.get(key).cables.push(obj);
            }
        }
    });
    
    return groups;
}

// Обновляет визуализацию кабелей - добавляет метки с количеством кабелей между объектами
function updateCableVisualization() {
    const groups = getCableGroups();
    
    // Удаляем старые метки кабелей (если есть)
    const labelsToRemove = objects.filter(obj => 
        obj.properties && obj.properties.get('type') === 'cableLabel'
    );
    
    labelsToRemove.forEach(label => {
        myMap.geoObjects.remove(label);
        objects = objects.filter(o => o !== label);
    });
    
    // Создаем метки для групп с несколькими кабелями
    groups.forEach((group, key) => {
        if (group.cables.length > 1) {
            // Вычисляем среднюю точку между объектами
            const midLat = (group.fromCoords[0] + group.toCoords[0]) / 2;
            const midLon = (group.fromCoords[1] + group.toCoords[1]) / 2;
            const midCoords = [midLat, midLon];
            
            // Создаем метку с количеством кабелей
            const label = new ymaps.Placemark(midCoords, {}, {
                iconLayout: 'default#imageWithContent',
                iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
                iconImageSize: [1, 1],
                iconImageOffset: [0, 0],
                iconContent: `<div style="background: rgba(255, 255, 255, 0.95); border: 2px solid #3b82f6; border-radius: 12px; padding: 4px 8px; font-size: 11px; font-weight: bold; color: #1e40af; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); white-space: nowrap;">${group.cables.length} каб.</div>`,
                iconContentOffset: [0, 0],
                zIndex: 500,
                zIndexHover: 500,
                cursor: 'default',
                hasBalloon: false,
                hasHint: false
            });
            
            label.properties.set('type', 'cableLabel');
            label.properties.set('cables', group.cables);
            
            objects.push(label);
            myMap.geoObjects.add(label);
        }
    });
}

function getUsedFibers(obj, cableUniqueId) {
    // Получаем информацию о использованных жилах для объекта
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
        obj.properties.set('usedFibers', usedFibersData);
    }
    
    return usedFibersData[cableUniqueId] || [];
}

function setUsedFibers(obj, cableUniqueId, fiberNumbers) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
        obj.properties.set('usedFibers', usedFibersData);
    }
    
    usedFibersData[cableUniqueId] = fiberNumbers;
    obj.properties.set('usedFibers', usedFibersData);
    saveData();
}

// Визуализация объединения жил в муфтах и кроссах
function renderFiberConnectionsVisualization(sleeveObj, connectedCables) {
    const objType = sleeveObj.properties.get('type');
    const isCross = objType === 'cross';
    
    let html = '<div class="fiber-connections-container" style="margin-top: 20px;">';
    html += `<h4 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1rem; font-weight: 600;">${isCross ? 'Управление жилами в кроссе' : 'Объединение жил в муфте'}</h4>`;
    
    // Получаем сохраненные соединения жил
    let fiberConnections = sleeveObj.properties.get('fiberConnections');
    if (!fiberConnections) {
        fiberConnections = [];
        sleeveObj.properties.set('fiberConnections', fiberConnections);
    }
    
    // Получаем подписи жил
    let fiberLabels = sleeveObj.properties.get('fiberLabels');
    if (!fiberLabels) {
        fiberLabels = {};
        sleeveObj.properties.set('fiberLabels', fiberLabels);
    }
    
    // Получаем соединения с узлами (для кроссов)
    let nodeConnections = sleeveObj.properties.get('nodeConnections');
    if (!nodeConnections) {
        nodeConnections = {};
        sleeveObj.properties.set('nodeConnections', nodeConnections);
    }
    
    // Подготавливаем данные о кабелях и их жилах
    const cablesData = connectedCables.map((cable, index) => {
        const cableType = cable.properties.get('cableType');
        const cableDescription = getCableDescription(cableType);
        const cableName = cable.properties.get('cableName') || '';
        const fibers = getFiberColors(cableType);
        let cableUniqueId = cable.properties.get('uniqueId');
        if (!cableUniqueId) {
            cableUniqueId = `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            cable.properties.set('uniqueId', cableUniqueId);
        }
        const usedFibers = getUsedFibers(sleeveObj, cableUniqueId);
        
        // Определяем направление кабеля (от муфты или к муфте)
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        const isFromSleeve = fromObj === sleeveObj;
        
        return {
            cable,
            cableUniqueId,
            cableType,
            cableDescription,
            cableName,
            fibers,
            usedFibers,
            index: index + 1,
            isFromSleeve
        };
    });
    
    // Определяем максимальное количество жил для расчета высоты
    const maxFibers = Math.max(...cablesData.map(c => c.fibers.length));
    
    // Создаем SVG для визуализации соединений
    const svgWidth = Math.min(800, window.innerWidth - 100);
    const svgHeight = Math.max(400, maxFibers * 35 + 100);
    const cableColumnWidth = svgWidth / (cablesData.length + 1);
    
    // Инструкция для режима редактирования
    if (isEditMode) {
        html += '<div style="padding: 10px; background: #e0f2fe; border-radius: 6px; margin-bottom: 15px; font-size: 0.875rem; color: #0369a1;">';
        if (isCross) {
            html += '<strong>Инструкция:</strong> В оптическом кроссе можно соединять жилы между кабелями и выводить жилы на узлы сети.<br>';
            html += '<span style="color: #22c55e;"><strong>Вывод на узел:</strong> Нажмите "Подключить к узлу" рядом с жилой, чтобы вывести её на узел сети.</span><br>';
            if (cablesData.length >= 2) {
                html += '<span style="color: #3b82f6;"><strong>Соединение жил:</strong> Кликните по жиле первого кабеля, затем по жиле второго для создания соединения.</span>';
            }
        } else if (cablesData.length >= 2) {
            html += '<strong>Инструкция:</strong> Кликните по жиле первого кабеля, затем по жиле второго кабеля для создания соединения. Клик по существующему соединению удалит его.<br>';
            html += '<span style="color: #dc2626;"><strong>Важно:</strong> Жила может быть соединена только с одной жилой из <u>другого</u> кабеля. Уже соединённые жилы выделены синей обводкой.</span>';
        }
        html += '</div>';
    }
    
    html += `<div style="overflow-x: auto; margin-bottom: 15px;">`;
    html += `<svg id="fiber-connections-svg" width="${svgWidth}" height="${svgHeight}" style="border: 1px solid #dee2e6; border-radius: 6px; background: #ffffff; display: block;">`;
    
    // Создаем карту позиций жил для отрисовки соединений
    const fiberPositions = new Map();
    
    // Создаем множество уже соединенных жил
    const connectedFibers = new Set();
    fiberConnections.forEach(conn => {
        connectedFibers.add(`${conn.from.cableId}-${conn.from.fiberNumber}`);
        connectedFibers.add(`${conn.to.cableId}-${conn.to.fiberNumber}`);
    });
    
    // Рисуем кабели и их жилы
    cablesData.forEach((cableData, cableIndex) => {
        const x = cableColumnWidth * (cableIndex + 1);
        const startY = 50;
        const fiberSpacing = 30;
        
        // Заголовок кабеля
        const svgCableTitle = cableData.cableName || `Кабель ${cableData.index}`;
        html += `<text x="${x}" y="25" text-anchor="middle" style="font-size: 11px; font-weight: 600; fill: #2c3e50;">${svgCableTitle}</text>`;
        html += `<text x="${x}" y="38" text-anchor="middle" style="font-size: 9px; fill: #6c757d;">${cableData.cableDescription}</text>`;
        
        // Рисуем жилы
        cableData.fibers.forEach((fiber, fiberIndex) => {
            const y = startY + fiberIndex * fiberSpacing;
            const isUsed = cableData.usedFibers.includes(fiber.number);
            const fiberKey = `${cableData.cableUniqueId}-${fiber.number}`;
            const isConnected = connectedFibers.has(fiberKey);
            
            // Сохраняем позицию жилы
            fiberPositions.set(fiberKey, { x, y, cableIndex, fiberIndex, cableData, fiber });
            
            // Определяем стиль обводки: соединенная жила - синяя обводка, используемая - красная пунктирная
            let strokeColor = '#333';
            let strokeWidth = '1';
            let strokeDasharray = 'none';
            let opacity = '1';
            
            if (isConnected) {
                strokeColor = '#3b82f6'; // синий цвет для соединенных жил
                strokeWidth = '3';
                strokeDasharray = 'none';
            } else if (isUsed) {
                strokeColor = '#dc2626';
                strokeWidth = '2';
                strokeDasharray = '3,3';
                opacity = '0.7';
            }
            
            // Круг жилы (кликабельный в режиме редактирования)
            const clickable = isEditMode ? 'cursor: pointer;' : '';
            html += `<circle id="fiber-${fiberKey}" cx="${x}" cy="${y}" r="12" fill="${fiber.color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" opacity="${opacity}" style="${clickable}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" data-fiber-connected="${isConnected}" data-fiber-used="${isUsed}"/>`;
            
            // Номер жилы
            html += `<text x="${x}" y="${y + 4}" text-anchor="middle" style="font-size: 9px; font-weight: 600; fill: ${fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' ? '#000' : '#fff'}; pointer-events: none;">${fiber.number}</text>`;
            
            // Получаем пользовательскую подпись жилы
            const fiberLabelKey = `${cableData.cableUniqueId}-${fiber.number}`;
            const customLabel = fiberLabels[fiberLabelKey] || '';
            
            // Название жилы с индикацией статуса соединения и подписью
            const statusText = isConnected ? ' (соед.)' : '';
            const labelText = customLabel ? ` [${customLabel}]` : '';
            html += `<text x="${x + 20}" y="${y + 4}" style="font-size: 10px; fill: ${isConnected ? '#3b82f6' : '#495057'};">${fiber.name}${labelText}${statusText}</text>`;
        });
    });
    
    // Рисуем сохраненные соединения между жилами
    fiberConnections.forEach((connection, connIndex) => {
        const fromKey = `${connection.from.cableId}-${connection.from.fiberNumber}`;
        const toKey = `${connection.to.cableId}-${connection.to.fiberNumber}`;
        
        const fromPos = fiberPositions.get(fromKey);
        const toPos = fiberPositions.get(toKey);
        
        if (fromPos && toPos) {
            const x1 = fromPos.x;
            const y1 = fromPos.y;
            const x2 = toPos.x;
            const y2 = toPos.y;
            
            // Линия соединения (кликабельная для удаления в режиме редактирования)
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - 10;
            const clickable = isEditMode ? 'cursor: pointer;' : '';
            html += `<path id="connection-${connIndex}" d="M ${x1 + 12} ${y1} Q ${midX} ${midY} ${x2 - 12} ${y2}" 
                stroke="#3b82f6" stroke-width="2" fill="none" opacity="0.8" stroke-dasharray="5,3" style="${clickable}" data-connection-index="${connIndex}"/>`;
            
            // Стрелка в середине
            html += `<polygon points="${midX - 3},${midY - 2} ${midX},${midY + 2} ${midX + 3},${midY - 2}" 
                fill="#3b82f6" opacity="0.8" style="${clickable}" data-connection-index="${connIndex}"/>`;
        }
    });
    
    html += '</svg>';
    html += '</div>';
    
    // Добавляем детальную информацию о кабелях
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">';
    
    cablesData.forEach((cableData, index) => {
        html += `<div class="cable-info" data-cable-id="${cableData.cableUniqueId}" style="border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; background: #f8f9fa;">`;
        html += `<div class="cable-header" style="margin-bottom: 10px;">`;
        const cableTitle = cableData.cableName ? `${cableData.cableName} (${cableData.cableDescription})` : `Кабель ${cableData.index}: ${cableData.cableDescription}`;
        html += `<h5 style="margin: 0 0 5px 0; color: #2c3e50; font-size: 0.875rem;">${cableTitle}</h5>`;
        html += `<div style="font-size: 0.75rem; color: #6c757d; margin-bottom: 8px;">${cableData.isFromSleeve ? '← От муфты' : '→ К муфте'}</div>`;
        
        // Добавляем элементы управления кабелем (только в режиме редактирования)
        if (isEditMode) {
            html += `<div class="cable-actions" style="display: flex; gap: 8px; margin-bottom: 10px;">`;
            html += `<select class="cable-type-select" data-cable-id="${cableData.cableUniqueId}" style="flex: 1; padding: 6px; border: 1px solid #ced4da; border-radius: 4px; font-size: 0.8125rem;">`;
            html += `<option value="fiber4" ${cableData.cableType === 'fiber4' ? 'selected' : ''}>ВОЛС 4 жилы</option>`;
            html += `<option value="fiber8" ${cableData.cableType === 'fiber8' ? 'selected' : ''}>ВОЛС 8 жил</option>`;
            html += `<option value="fiber16" ${cableData.cableType === 'fiber16' ? 'selected' : ''}>ВОЛС 16 жил</option>`;
            html += `<option value="fiber24" ${cableData.cableType === 'fiber24' ? 'selected' : ''}>ВОЛС 24 жилы</option>`;
            html += `<option value="copper" ${cableData.cableType === 'copper' ? 'selected' : ''}>Медный кабель</option>`;
            html += `</select>`;
            html += `<button class="btn-delete-cable" data-cable-id="${cableData.cableUniqueId}" title="Удалить кабель" style="padding: 6px 10px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8125rem;">✕</button>`;
            html += `</div>`;
        }
        
        html += `</div>`;
        html += `<div class="fibers-list" style="display: flex; flex-direction: column; gap: 6px;">`;
        
        cableData.fibers.forEach((fiber) => {
            const isUsed = cableData.usedFibers.includes(fiber.number);
            const fiberLabelKey = `${cableData.cableUniqueId}-${fiber.number}`;
            const customLabel = fiberLabels[fiberLabelKey] || '';
            
            // Проверяем, есть ли соединение для этой жилы (для кнопки трассировки)
            const isConnected = fiberConnections.some(conn => 
                (conn.from.cableId === cableData.cableUniqueId && conn.from.fiberNumber === fiber.number) ||
                (conn.to.cableId === cableData.cableUniqueId && conn.to.fiberNumber === fiber.number)
            );
            
            // Проверяем подключение к узлу (для кроссов)
            const nodeConnection = nodeConnections[fiberLabelKey];
            const hasNodeConnection = !!nodeConnection;
            
            html += `
                <div class="fiber-item ${isUsed ? 'fiber-used' : 'fiber-free'}" 
                     data-cable-id="${cableData.cableUniqueId}" 
                     data-fiber-number="${fiber.number}"
                     style="display: flex; flex-direction: column; gap: 4px; padding: 8px; background: ${isUsed ? '#fee2e2' : (hasNodeConnection ? '#dcfce7' : '#ffffff')}; border-radius: 4px; border: 1px solid ${isUsed ? '#dc2626' : (hasNodeConnection ? '#22c55e' : '#e5e7eb')};">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="fiber-color" style="width: 20px; height: 20px; border-radius: 50%; background-color: ${fiber.color}; border: 2px solid #333; flex-shrink: 0;"></div>
                        <span style="font-size: 0.8125rem; color: #495057; flex: 1;">Жила ${fiber.number}: ${fiber.name}</span>
                        ${isUsed ? '<span style="font-size: 0.7rem; color: #dc2626; font-weight: 600;">(исп.)</span>' : (hasNodeConnection ? '<span style="font-size: 0.7rem; color: #22c55e; font-weight: 600;">(на узел)</span>' : '<span style="font-size: 0.7rem; color: #22c55e; font-weight: 600;">(своб.)</span>')}
                        ${!isUsed && isEditMode ? `<button class="btn-continue-cable" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Продолжить кабель с этой жилой" style="padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">→</button>` : ''}
                    </div>
                    ${hasNodeConnection ? `
                        <div style="display: flex; align-items: center; gap: 4px; margin-left: 28px; padding: 4px 8px; background: #f0fdf4; border-radius: 3px;">
                            <span style="font-size: 0.75rem; color: #166534;">🖥️ → ${nodeConnection.nodeName}</span>
                            ${isEditMode ? `<button class="btn-disconnect-node" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от узла" style="padding: 2px 6px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}
                        </div>
                    ` : ''}
                    ${isCross && !hasNodeConnection && !isConnected && isEditMode ? `
                        <div style="margin-left: 28px;">
                            <button class="btn-connect-node" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к узлу" style="padding: 4px 8px; background: #22c55e; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.7rem;">🖥️ Подключить к узлу</button>
                        </div>
                    ` : ''}
                    ${isEditMode ? `
                        <div style="display: flex; align-items: center; gap: 4px; margin-left: 28px;">
                            <input type="text" 
                                   class="fiber-label-input" 
                                   data-cable-id="${cableData.cableUniqueId}" 
                                   data-fiber-number="${fiber.number}"
                                   value="${customLabel}" 
                                   placeholder="Подпись жилы..." 
                                   style="flex: 1; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.75rem;">
                        </div>
                    ` : (customLabel ? `<div style="margin-left: 28px; font-size: 0.75rem; color: #6366f1; font-weight: 500;">📝 ${customLabel}</div>` : '')}
                </div>
            `;
        });
        
        html += `</div>`;
        html += `</div>`;
    });
    
    html += '</div>';
    html += '</div>';
    
    // Сохраняем данные для обработчиков событий
    html += `<div id="fiber-connections-data" data-sleeve-obj-id="${sleeveObj.properties.get('uniqueId') || 'temp'}" style="display: none;"></div>`;
    
    return html;
}

// Показывает диалог для объединения кабелей
function showMergeCablesDialog(sleeveObj) {
    const connectedCables = getConnectedCables(sleeveObj);
    
    if (connectedCables.length < 2) {
        alert('Для объединения нужно минимум 2 кабеля');
        return;
    }
    
    // Подсчитываем общее количество жил
    let totalFibers = 0;
    const cablesInfo = connectedCables.map(cable => {
        const cableType = cable.properties.get('cableType');
        const fiberCount = getFiberCount(cableType);
        totalFibers += fiberCount;
        const cableDescription = getCableDescription(cableType);
        return { cable, cableType, fiberCount, cableDescription };
    });
    
    // Определяем тип нового кабеля на основе общего количества жил
    let newCableType = 'fiber4';
    if (totalFibers <= 4) newCableType = 'fiber4';
    else if (totalFibers <= 8) newCableType = 'fiber8';
    else if (totalFibers <= 16) newCableType = 'fiber16';
    else if (totalFibers <= 24) newCableType = 'fiber24';
    else {
        alert(`Общее количество жил (${totalFibers}) превышает максимальную вместимость кабеля (24). Невозможно объединить.`);
        return;
    }
    
    // Проверяем, что объединенный кабель не превысит вместимость муфты
    const maxFibers = sleeveObj.properties.get('maxFibers');
    if (maxFibers && maxFibers > 0) {
        const usedFibersCount = getTotalUsedFibersInSleeve(sleeveObj);
        if (usedFibersCount - totalFibers + getFiberCount(newCableType) > maxFibers) {
            alert(`Объединение невозможно: новый кабель превысит максимальную вместимость муфты!`);
            return;
        }
    }
    
    // Подтверждаем объединение
    const cablesList = cablesInfo.map(c => `- ${c.cableDescription} (${c.fiberCount} жил)`).join('\n');
    const confirmMsg = `Объединить кабели в один?\n\n${cablesList}\n\nИтого: ${totalFibers} жил → ${getCableDescription(newCableType)}`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    // Находим второй объект (не муфта) для каждого кабеля
    const targetObjects = new Set();
    cablesInfo.forEach(info => {
        const fromObj = info.cable.properties.get('from');
        const toObj = info.cable.properties.get('to');
        if (fromObj !== sleeveObj) targetObjects.add(fromObj);
        if (toObj !== sleeveObj) targetObjects.add(toObj);
    });
    
    if (targetObjects.size !== 1) {
        alert('Объединение возможно только для кабелей, идущих от одной муфты к одному объекту');
        return;
    }
    
    const targetObj = Array.from(targetObjects)[0];
    
    // Создаем новый объединенный кабель
    const success = addCable(sleeveObj, targetObj, newCableType);
    if (!success) {
        return;
    }
    
    // Находим новый кабель
    const newCable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        ((obj.properties.get('from') === sleeveObj && obj.properties.get('to') === targetObj) ||
         (obj.properties.get('from') === targetObj && obj.properties.get('to') === sleeveObj))
    );
    
    if (!newCable) {
        alert('Ошибка при создании объединенного кабеля');
        return;
    }
    
    // Удаляем старые кабели
    cablesInfo.forEach(info => {
        deleteCableByUniqueId(info.cable.properties.get('uniqueId'));
    });
    
    // Закрываем модальное окно и показываем информацию о новом кабеле
    document.getElementById('infoModal').style.display = 'none';
    showObjectInfo(sleeveObj);
    
    alert(`Кабели успешно объединены в ${getCableDescription(newCableType)}`);
}

function toggleFiberUsage(cableUniqueId, fiberNumber) {
    if (!currentModalObject) return;
    
    const usedFibers = getUsedFibers(currentModalObject, cableUniqueId);
    const index = usedFibers.indexOf(fiberNumber);
    
    if (index > -1) {
        // Убираем жилу из списка использованных
        usedFibers.splice(index, 1);
    } else {
        // Добавляем жилу в список использованных
        usedFibers.push(fiberNumber);
    }
    
    setUsedFibers(currentModalObject, cableUniqueId, usedFibers);
    
    // Обновляем модальное окно
    showObjectInfo(currentModalObject);
}

function getFiberColors(cableType) {
    const fiberColors = [
        { number: 1, name: 'Синий', color: '#0000FF' },
        { number: 2, name: 'Оранжевый', color: '#FF8C00' },
        { number: 3, name: 'Зеленый', color: '#00FF00' },
        { number: 4, name: 'Коричневый', color: '#8B4513' },
        { number: 5, name: 'Серый', color: '#808080' },
        { number: 6, name: 'Белый', color: '#FFFFFF' },
        { number: 7, name: 'Красный', color: '#FF0000' },
        { number: 8, name: 'Черный', color: '#000000' },
        { number: 9, name: 'Желтый', color: '#FFFF00' },
        { number: 10, name: 'Фиолетовый', color: '#800080' },
        { number: 11, name: 'Розовый', color: '#FFC0CB' },
        { number: 12, name: 'Голубой', color: '#00CED1' },
        { number: 13, name: 'Оливковый', color: '#808000' },
        { number: 14, name: 'Темно-синий', color: '#00008B' },
        { number: 15, name: 'Бирюзовый', color: '#40E0D0' },
        { number: 16, name: 'Темно-зеленый', color: '#006400' },
        { number: 17, name: 'Малиновый', color: '#DC143C' },
        { number: 18, name: 'Коричневый', color: '#A52A2A' },
        { number: 19, name: 'Лимонный', color: '#FFFACD' },
        { number: 20, name: 'Темно-красный', color: '#8B0000' },
        { number: 21, name: 'Лазурный', color: '#007FFF' },
        { number: 22, name: 'Золотой', color: '#FFD700' },
        { number: 23, name: 'Медный', color: '#B87333' },
        { number: 24, name: 'Серебряный', color: '#C0C0C0' }
    ];
    
    let fiberCount = 0;
    switch(cableType) {
        case 'fiber4': fiberCount = 4; break;
        case 'fiber8': fiberCount = 8; break;
        case 'fiber16': fiberCount = 16; break;
        case 'fiber24': fiberCount = 24; break;
        case 'copper': 
            // Для медного кабеля используем стандартные цвета пар витой пары
            return [
                { number: 1, name: 'Бело-синий / Синий', color: '#4169E1' },
                { number: 2, name: 'Бело-оранжевый / Оранжевый', color: '#FF8C00' },
                { number: 3, name: 'Бело-зеленый / Зеленый', color: '#32CD32' },
                { number: 4, name: 'Бело-коричневый / Коричневый', color: '#8B4513' }
            ];
        default: return [];
    }
    
    return fiberColors.slice(0, fiberCount);
}

// ==================== NetBox интеграция ====================

function setupNetBoxEventListeners() {
    // Кнопка открытия настроек NetBox
    document.getElementById('netboxConfigBtn').addEventListener('click', function() {
        const modal = document.getElementById('netboxConfigModal');
        document.getElementById('netboxUrl').value = netboxConfig.url || '';
        document.getElementById('netboxToken').value = netboxConfig.token || '';
        document.getElementById('netboxIgnoreSSL').checked = netboxConfig.ignoreSSL || false;
        document.getElementById('netboxStatus').textContent = '';
        modal.style.display = 'block';
    });

    // Кнопка закрытия модального окна настроек
    document.querySelector('.close-netbox').addEventListener('click', function() {
        document.getElementById('netboxConfigModal').style.display = 'none';
    });

    // Закрытие модального окна настроек при клике вне его
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('netboxConfigModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Кнопка тестирования подключения
    document.getElementById('testNetboxConnection').addEventListener('click', testNetBoxConnection);

    // Кнопка сохранения конфигурации
    document.getElementById('saveNetboxConfig').addEventListener('click', function() {
        const url = document.getElementById('netboxUrl').value.trim();
        const token = document.getElementById('netboxToken').value.trim();
        const ignoreSSL = document.getElementById('netboxIgnoreSSL').checked;

        if (!url || !token) {
            showNetBoxStatus('Заполните все поля', 'error');
            return;
        }

        netboxConfig.url = url.replace(/\/$/, ''); // Убираем завершающий слэш
        netboxConfig.token = token;
        netboxConfig.ignoreSSL = ignoreSSL;
        saveNetBoxConfig();
        showNetBoxStatus('Конфигурация сохранена', 'success');
        
        setTimeout(() => {
            document.getElementById('netboxConfigModal').style.display = 'none';
        }, 1500);
    });

    // Кнопка импорта устройств из NetBox
    document.getElementById('netboxImportBtn').addEventListener('click', function() {
        if (!netboxConfig.url || !netboxConfig.token) {
            return;
        }
        openNetBoxImportModal();
    });

    // Кнопка закрытия модального окна импорта
    document.querySelector('.close-import').addEventListener('click', function() {
        document.getElementById('netboxImportModal').style.display = 'none';
    });

    // Закрытие модального окна импорта при клике вне его
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('netboxImportModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Кнопка выбора всех устройств
    document.getElementById('selectAllDevices').addEventListener('click', function() {
        document.querySelectorAll('#netboxDevicesList input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
        });
    });

    // Кнопка снятия выбора со всех устройств
    document.getElementById('deselectAllDevices').addEventListener('click', function() {
        document.querySelectorAll('#netboxDevicesList input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    });

    // Кнопка импорта выбранных устройств
    document.getElementById('importSelectedDevices').addEventListener('click', importSelectedNetBoxDevices);
}

function loadNetBoxConfig() {
    const saved = localStorage.getItem('netboxConfig');
    if (saved) {
        try {
            netboxConfig = JSON.parse(saved);
        } catch (e) {
            console.error('Ошибка загрузки конфигурации NetBox:', e);
        }
    }
}

function saveNetBoxConfig() {
    localStorage.setItem('netboxConfig', JSON.stringify(netboxConfig));
}

function showNetBoxStatus(message, type) {
    const statusEl = document.getElementById('netboxStatus');
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    if (type === 'success') {
        statusEl.style.color = '#22c55e';
    } else if (type === 'error') {
        statusEl.style.color = '#ef4444';
    } else {
        statusEl.style.color = '#3b82f6';
    }
}

// Функция для выполнения fetch запросов с учетом настройки SSL
async function netboxFetch(url, options = {}) {
    // Если ignoreSSL включен, пытаемся использовать специальные опции
    // В браузере это не сработает напрямую, но код готов для Electron/Node.js
    if (netboxConfig.ignoreSSL) {
        // В Electron можно использовать опции для отключения проверки SSL
        // Для браузера это не работает из соображений безопасности
        try {
            // Пытаемся выполнить запрос
            return await fetch(url, options);
        } catch (error) {
            // Если ошибка связана с SSL, пытаемся обработать её
            if (error.message && (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS'))) {
                console.warn('SSL ошибка обнаружена. В браузере нельзя отключить проверку SSL. Используйте Electron или настройте сертификат.');
                throw new Error('Ошибка SSL сертификата. В браузере нельзя отключить проверку SSL. Для работы с самоподписанными сертификатами используйте Electron или настройте браузер.');
            }
            throw error;
        }
    } else {
        return await fetch(url, options);
    }
}

async function testNetBoxConnection() {
    const url = document.getElementById('netboxUrl').value.trim();
    const token = document.getElementById('netboxToken').value.trim();
    const ignoreSSL = document.getElementById('netboxIgnoreSSL').checked;

    if (!url || !token) {
        showNetBoxStatus('Заполните все поля', 'error');
        return;
    }

    showNetBoxStatus('Проверка подключения...', 'info');

    try {
        // Временно сохраняем настройку ignoreSSL для теста
        const originalIgnoreSSL = netboxConfig.ignoreSSL;
        netboxConfig.ignoreSSL = ignoreSSL;
        
        const response = await netboxFetch(`${url}/api/dcim/devices/?limit=1`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        // Восстанавливаем оригинальную настройку
        netboxConfig.ignoreSSL = originalIgnoreSSL;

        if (response.ok) {
            showNetBoxStatus('Подключение успешно!', 'success');
        } else if (response.status === 401) {
            showNetBoxStatus('Ошибка: Неверный токен API', 'error');
        } else if (response.status === 404) {
            showNetBoxStatus('Ошибка: Сервер не найден. Проверьте URL', 'error');
        } else {
            showNetBoxStatus(`Ошибка: ${response.status} ${response.statusText}`, 'error');
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.message && (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS'))) {
            errorMessage = 'Ошибка SSL сертификата. В браузере нельзя отключить проверку SSL. Для работы с самоподписанными сертификатами используйте Electron или настройте браузер.';
        }
        showNetBoxStatus(`Ошибка подключения: ${errorMessage}`, 'error');
        console.error('NetBox connection error:', error);
    }
}

async function openNetBoxImportModal() {
    const modal = document.getElementById('netboxImportModal');
    const devicesList = document.getElementById('netboxDevicesList');
    
    devicesList.innerHTML = '<div style="text-align: center; padding: 20px;">Загрузка устройств...</div>';
    modal.style.display = 'block';

    try {
        await fetchNetBoxDevices();
        showNetBoxDevices();
    } catch (error) {
        devicesList.innerHTML = `<div style="color: #ef4444; padding: 20px;">Ошибка загрузки устройств: ${error.message}</div>`;
    }
}

async function fetchNetBoxDevices() {
    netboxDevices = [];
    let nextUrl = `${netboxConfig.url}/api/dcim/devices/?limit=100`;

    try {
        while (nextUrl) {
            const response = await netboxFetch(nextUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${netboxConfig.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.results && Array.isArray(data.results)) {
                netboxDevices = netboxDevices.concat(data.results);
            }

            // Проверяем наличие следующей страницы
            nextUrl = data.next || null;
        }
    } catch (error) {
        console.error('Ошибка загрузки устройств из NetBox:', error);
        throw error;
    }
}

function showNetBoxDevices() {
    const devicesList = document.getElementById('netboxDevicesList');

    if (netboxDevices.length === 0) {
        devicesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Устройства не найдены</div>';
        return;
    }

    let html = '<div style="max-height: 400px; overflow-y: auto; margin-bottom: 15px;">';
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: #f8f9fa; position: sticky; top: 0;">';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6; width: 40px;"><input type="checkbox" id="selectAllCheckbox"></th>';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Имя</th>';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Тип</th>';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Местоположение</th>';
    html += '</tr></thead><tbody>';

    netboxDevices.forEach((device, index) => {
        const name = device.name || device.display || `Устройство #${device.id}`;
        const deviceType = device.device_type?.model || 'Не указан';
        const location = device.site?.name || device.location?.name || 'Не указано';
        const hasCoords = device.site?.latitude && device.site?.longitude;

        html += `<tr style="border-bottom: 1px solid #dee2e6;">`;
        const disabledAttr = hasCoords ? '' : 'disabled title="У устройства нет координат"';
        html += `<td style="padding: 10px;"><input type="checkbox" class="device-checkbox" data-index="${index}" ${disabledAttr}></td>`;
        html += `<td style="padding: 10px;">${escapeHtml(name)}</td>`;
        html += `<td style="padding: 10px;">${escapeHtml(deviceType)}</td>`;
        html += `<td style="padding: 10px;">${escapeHtml(location)}</td>`;
        html += `</tr>`;
    });

    html += '</tbody></table></div>';

    devicesList.innerHTML = html;

    // Обработчик для чекбокса "Выбрать все"
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            document.querySelectorAll('.device-checkbox:not(:disabled)').forEach(cb => {
                cb.checked = this.checked;
            });
        });
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function importSelectedNetBoxDevices() {
    if (!isEditMode) {
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.device-checkbox:checked:not(:disabled)');
    
    if (selectedCheckboxes.length === 0) {
        return;
    }

    let importedCount = 0;
    let skippedCount = 0;

    selectedCheckboxes.forEach(checkbox => {
        const index = parseInt(checkbox.getAttribute('data-index'));
        const device = netboxDevices[index];

        if (!device) return;

        const site = device.site;
        if (!site || !site.latitude || !site.longitude) {
            skippedCount++;
            return;
        }

        const coords = [parseFloat(site.latitude), parseFloat(site.longitude)];
        const deviceName = device.name || device.display || `NetBox-${device.id}`;

        // Проверяем, не существует ли уже узел с таким именем
        const existingNode = objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'node' &&
            obj.properties.get('name') === deviceName
        );

        if (existingNode) {
            skippedCount++;
            return;
        }

        // Создаем узел
        createObject('node', deviceName, coords);

        // Сохраняем дополнительную информацию об устройстве из NetBox
        const nodeObj = objects[objects.length - 1];
        if (nodeObj && nodeObj.properties) {
            nodeObj.properties.set('netboxId', device.id);
            nodeObj.properties.set('netboxUrl', `${netboxConfig.url}/dcim/devices/${device.id}/`);
            nodeObj.properties.set('netboxDeviceType', device.device_type?.model || '');
            nodeObj.properties.set('netboxSite', site.name || '');
        }

        importedCount++;
    });

    // Закрываем модальное окно
    document.getElementById('netboxImportModal').style.display = 'none';

    // Центрируем карту на импортированных устройствах, если они есть
    if (importedCount > 0) {
        const importedNodes = objects.filter(obj => 
            obj.properties && 
            obj.properties.get('type') === 'node' &&
            obj.properties.get('netboxId')
        );
        
        if (importedNodes.length > 0) {
            const bounds = importedNodes.map(node => node.geometry.getCoordinates());
            myMap.setBounds(myMap.geoObjects.getBounds(), {
                checkZoomRange: true
            });
        }
    }
}

// ==================== Управление аккордеонами ====================

function setupAccordions() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const accordionSection = this.parentElement;
            const isActive = accordionSection.classList.contains('active');
            
            // Закрываем все аккордеоны
            document.querySelectorAll('.accordion-section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Открываем текущий, если он был закрыт
            if (!isActive) {
                accordionSection.classList.add('active');
            }
        });
    });
    
    // Открываем первый аккордеон по умолчанию
    const firstAccordion = document.querySelector('.accordion-section');
    if (firstAccordion) {
        firstAccordion.classList.add('active');
    }
}

// Инициализация UI
setTimeout(() => {
    updateUIForMode();
    updateEditControls();
    updateStats();
    updateCableVisualization();
    updateAllNodeConnectionLines();
}, 100);
