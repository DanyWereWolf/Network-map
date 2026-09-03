/**
 * Подсветка объектов на карте, фантом и курсор при размещении.
 */
function clearShowOnMapHighlight() {
    if (!showOnMapHighlightState) return;
    var s = showOnMapHighlightState;
    showOnMapHighlightState = null;
    if (s.timeoutId) clearTimeout(s.timeoutId);
    if (s.obj && s.obj.options) {
        try {
            if (s.isCable) {
                s.obj.options.set('strokeColor', s.originalOptions.strokeColor || '#3b82f6');
                s.obj.options.set('strokeWidth', s.originalOptions.strokeWidth != null ? s.originalOptions.strokeWidth : 3);
            } else {
                if (s.originalOptions.preset) s.obj.options.set('preset', s.originalOptions.preset);
            }
        } catch (e) {}
    }
}

var MAP_HOVER_TYPE_LABELS = {
    support: 'Опора связи',
    sleeve: 'Кабельная муфта',
    spliceCassette: 'Сплайс-кассета',
    cross: 'Оптический кросс',
    node: 'Узел сети',
    attachment: 'Крепление узлов',
    manhole: 'Колодец',
    signalPost: 'Сигнальный столб',
    cabinet: 'Ящик',
    olt: 'OLT (GPON)',
    splitter: 'Сплиттер',
    onu: 'ONU',
    camera: 'Камера',
    mediaConverter: 'Медиаконвертер',
    radioBridge: 'Wi‑Fi радиомост',
    switch: 'Коммутатор',
    cable: 'Кабель',
    crossGroup: 'Группа кроссов',
    nodeGroup: 'Группа узлов'
};

var ZABBIX_SEV_LABELS = {
    0: 'Не классифицировано',
    1: 'Информация',
    2: 'Предупреждение',
    3: 'Средняя',
    4: 'Высокая',
    5: 'Чрезвычайная'
};

function createCursorIndicator() {
    cursorIndicator = document.createElement('div');
    cursorIndicator.id = 'cursorIndicator';
    cursorIndicator.className = 'map-hover-card';
    cursorIndicator.setAttribute('aria-hidden', 'true');
    cursorIndicator.style.display = 'none';
    document.body.appendChild(cursorIndicator);
}

function getMapHoverTypeLabel(type) {
    return MAP_HOVER_TYPE_LABELS[type] || 'Объект';
}

function escHover(text) {
    return typeof escapeHtml === 'function' ? escapeHtml(String(text == null ? '' : text)) : String(text == null ? '' : text);
}

function getMapHoverObjectName(obj, type) {
    if (!obj || !obj.properties) return getMapHoverTypeLabel(type);
    if (type === 'cable') {
        var cableName = (obj.properties.get('cableName') || '').trim();
        if (cableName) return cableName;
        if (typeof buildCableRouteDisplayName === 'function') {
            var route = buildCableRouteDisplayName(obj);
            if (route) return route;
        }
        if (typeof getCableDescription === 'function') {
            return getCableDescription(obj.properties.get('cableType'), obj);
        }
        return 'Кабель';
    }
    if (type === 'crossGroup' || type === 'nodeGroup') {
        var gName = (obj.properties.get('name') || obj.properties.get('hintContent') || '').trim();
        if (gName) return gName;
    }
    var name = (obj.properties.get('name') || '').trim();
    return name || getMapHoverTypeLabel(type);
}

function buildMapHoverMetaRows(obj, type) {
    if (!obj || !obj.properties) return '';
    var rows = [];
    var p = obj.properties;
    function push(label, value) {
        var v = (value == null ? '' : String(value)).trim();
        if (!v) return;
        rows.push('<div class="map-hover-card__meta-row"><span class="map-hover-card__meta-k">' +
            escHover(label) + '</span><span class="map-hover-card__meta-v">' + escHover(v) + '</span></div>');
    }
    if (type === 'cable') {
        if (typeof getCableDescription === 'function') {
            push('Тип', getCableDescription(p.get('cableType'), obj));
        }
        var fibers = p.get('fiberCount') || p.get('fibers');
        if (fibers) push('Жил', fibers);
        return rows.join('');
    }
    var mfr = (p.get('manufacturer') || '').trim();
    var model = (p.get('model') || '').trim();
    if (mfr || model) push('Модель', [mfr, model].filter(Boolean).join(' · '));
    push('IP', p.get('ipAddress'));
    if (type === 'node') {
        var nk = p.get('nodeKind') || 'network';
        push('Вид', nk === 'aggregation' ? 'Агрегация' : 'Сеть');
    }
    if (type === 'camera' && window.CameraPlayer) {
        push('Стрим', CameraPlayer.isCameraOnline(obj) ? 'Онлайн' : 'Офлайн');
    }
    if (type === 'olt') {
        var pon = p.get('ponPorts');
        if (pon) push('PON-порты', pon);
    }
    if (type === 'splitter') {
        var ratio = p.get('splitRatio');
        if (ratio) push('Деление', '1:' + ratio);
    }
    if (type === 'cabinet') {
        push('Адрес', p.get('address'));
        var units = p.get('cabinetUnits');
        if (units) push('Unit', units + 'U');
    }
    if (type === 'cross') {
        var ports = p.get('crossPorts');
        if (ports) push('Порты', ports);
    }
    return rows.join('');
}

function buildMapHoverZabbixBlock(obj) {
    if (!obj || !obj.properties) return '';
    var orgOn = typeof isOrgZabbixMonitoringEnabled === 'function' && isOrgZabbixMonitoringEnabled();
    var configuredHost = (obj.properties.get('zabbixHost') || '').trim();
    var st = (window.ZabbixStatus && typeof ZabbixStatus.getForPlacemark === 'function')
        ? ZabbixStatus.getForPlacemark(obj)
        : null;

    if (!orgOn && !st && !configuredHost) return '';

    if (st && st.matched) {
        var sev = st.ok ? 0 : Math.max(0, Math.min(5, Number(st.severity) || 0));
        var sevCls = st.ok ? 'map-hover-zabbix--ok' : ('map-hover-zabbix--sev' + sev);
        var statusText = st.ok ? 'OK' : (ZABBIX_SEV_LABELS[sev] || ('Severity ' + sev));
        var hostLine = st.host || configuredHost || '';
        var html = '<div class="map-hover-zabbix ' + sevCls + '">';
        html += '<div class="map-hover-zabbix__head">';
        html += '<span class="map-hover-zabbix__badge"><span class="map-hover-zabbix__dot" aria-hidden="true"></span>' +
            escHover(st.ok ? 'OK' : ('S' + sev)) + '</span>';
        html += '<div class="map-hover-zabbix__titles">';
        html += '<div class="map-hover-zabbix__status">' + escHover(statusText) + '</div>';
        if (hostLine) html += '<div class="map-hover-zabbix__host">' + escHover(hostLine) + '</div>';
        html += '</div></div>';
        if (!st.ok && Array.isArray(st.problems) && st.problems.length) {
            html += '<ul class="map-hover-zabbix__problems">';
            st.problems.slice(0, 4).forEach(function(pr) {
                html += '<li>' + escHover(pr) + '</li>';
            });
            if (st.problems.length > 4) {
                html += '<li class="map-hover-zabbix__more">ещё ' + (st.problems.length - 4) + '…</li>';
            }
            html += '</ul>';
        } else if (st.ok) {
            html += '<div class="map-hover-zabbix__ok-note">Проблем нет</div>';
        }
        html += '</div>';
        return html;
    }

    if (configuredHost && orgOn) {
        return '<div class="map-hover-zabbix map-hover-zabbix--pending">' +
            '<div class="map-hover-zabbix__head">' +
            '<span class="map-hover-zabbix__badge"><span class="map-hover-zabbix__dot" aria-hidden="true"></span>—</span>' +
            '<div class="map-hover-zabbix__titles">' +
            '<div class="map-hover-zabbix__status">Ожидание данных</div>' +
            '<div class="map-hover-zabbix__host">' + escHover(configuredHost) + '</div>' +
            '</div></div></div>';
    }

    if (configuredHost) {
        return '<div class="map-hover-zabbix map-hover-zabbix--idle">' +
            '<div class="map-hover-zabbix__host-only">Zabbix: ' + escHover(configuredHost) + '</div></div>';
    }
    return '';
}

function buildMapHoverCardHtml(obj, objectType) {
    var type = objectType || (obj && obj.properties ? obj.properties.get('type') : null) || 'object';
    var typeLabel = getMapHoverTypeLabel(type);
    var isPlacement = !obj;
    var name = isPlacement ? typeLabel : getMapHoverObjectName(obj, type);
    var showNameAsTitle = !isPlacement && name && name !== typeLabel;

    var iconHtml = '';
    if (window.MapIcons && typeof MapIcons.buildIconSvg === 'function' && type !== 'cable') {
        var iconOpts = { variant: 'normal' };
        if (type === 'node' && obj && obj.properties) {
            iconOpts.nodeKind = obj.properties.get('nodeKind') || 'network';
        }
        if (type === 'camera' && obj && window.CameraPlayer) {
            iconOpts.cameraOnline = CameraPlayer.isCameraOnline(obj);
        }
        if (obj && window.ZabbixStatus && typeof ZabbixStatus.getForPlacemark === 'function') {
            var zx = ZabbixStatus.getForPlacemark(obj);
            if (zx && zx.matched) {
                iconOpts.zabbixSeverity = zx.ok ? 0 : (zx.severity != null ? zx.severity : 0);
            }
        }
        try {
            iconHtml = '<div class="map-hover-card__icon" aria-hidden="true">' +
                MapIcons.buildIconSvg(type === 'crossGroup' || type === 'nodeGroup' ? (type === 'crossGroup' ? 'cross' : 'node') : type, iconOpts) +
                '</div>';
        } catch (eIcon) {
            iconHtml = '';
        }
    }

    var html = '<div class="map-hover-card__inner' + (isPlacement ? ' map-hover-card__inner--placement' : '') + '">';
    html += '<div class="map-hover-card__main">';
    html += iconHtml;
    html += '<div class="map-hover-card__text">';
    if (showNameAsTitle) {
        html += '<div class="map-hover-card__name">' + escHover(name) + '</div>';
        html += '<div class="map-hover-card__type">' + escHover(typeLabel) + '</div>';
    } else {
        html += '<div class="map-hover-card__name">' + escHover(typeLabel) + '</div>';
    }
    html += '</div></div>';

    if (!isPlacement) {
        var meta = buildMapHoverMetaRows(obj, type);
        if (meta) html += '<div class="map-hover-card__meta">' + meta + '</div>';
        var zxBlock = buildMapHoverZabbixBlock(obj);
        if (zxBlock) html += zxBlock;
    }
    html += '</div>';
    return html;
}

function positionMapHoverCard(objectCoord) {
    if (!cursorIndicator) return;
    var clientX = window.lastMouseX || 0;
    var clientY = window.lastMouseY || 0;
    if (objectCoord && objectCoord.length >= 2 && typeof geoToClient === 'function') {
        var pt = geoToClient(objectCoord);
        if (pt) {
            clientX = pt[0];
            clientY = pt[1];
        }
    }
    if (!(clientX > 0 || clientY > 0)) return;

    cursorIndicator.style.left = clientX + 'px';
    cursorIndicator.style.top = (clientY + 16) + 'px';
    cursorIndicator.style.transform = 'translate(-50%, 0)';

    // Не выходить за край экрана
    requestAnimationFrame(function() {
        if (!cursorIndicator || cursorIndicator.style.display === 'none') return;
        var rect = cursorIndicator.getBoundingClientRect();
        var pad = 8;
        var dx = 0;
        var dy = 0;
        if (rect.right > window.innerWidth - pad) dx = window.innerWidth - pad - rect.right;
        if (rect.left + dx < pad) dx = pad - rect.left;
        if (rect.bottom > window.innerHeight - pad) {
            dy = -(rect.height + 28);
        }
        if (dx || dy) {
            cursorIndicator.style.transform = 'translate(calc(-50% + ' + dx + 'px), ' + dy + 'px)';
        }
    });
}

function updateCursorIndicator(e, objectType, objectCoord, obj, forceContent) {
    if (!cursorIndicator) return;

    if (objectType && (e || obj)) {
        var targetObj = obj || (typeof hoveredObject !== 'undefined' ? hoveredObject : null);
        if (targetObj && targetObj.properties && targetObj.properties.get('type') !== objectType) {
            targetObj = null;
        }
        // Режим размещения — только тип, без привязки к hoveredObject
        if (!obj && typeof objectPlacementMode !== 'undefined' && objectPlacementMode) {
            targetObj = null;
        }
        var nextUid = targetObj && targetObj.properties
            ? String(targetObj.properties.get('uniqueId') || '')
            : '';
        var placementKey = (!targetObj && objectType) ? ('place:' + objectType) : '';
        var contentKey = nextUid || placementKey;
        var sameContent = !!contentKey &&
            cursorIndicator._hoverContentKey === contentKey &&
            cursorIndicator.style.display !== 'none';

        if (!sameContent || forceContent) {
            cursorIndicator.className = 'map-hover-card' +
                (targetObj ? ' map-hover-card--rich' : ' map-hover-card--placement') +
                (sameContent && forceContent ? ' map-hover-card--quiet' : '');
            cursorIndicator.innerHTML = buildMapHoverCardHtml(targetObj, objectType);
        }

        cursorIndicator.style.display = 'block';
        cursorIndicator._hoverObjUid = nextUid;
        cursorIndicator._hoverContentKey = contentKey;
        positionMapHoverCard(objectCoord);
    } else {
        cursorIndicator.style.display = 'none';
        cursorIndicator.style.transform = '';
        cursorIndicator.innerHTML = '';
        cursorIndicator._hoverObjUid = '';
        cursorIndicator._hoverContentKey = '';
        cursorIndicator.className = 'map-hover-card';
    }
}

/** Объект, за которым карточка следует во время drag. */
var mapHoverCardFollowObj = null;

function followMapHoverCardDuringDrag(obj) {
    if (!cursorIndicator || !obj || !obj.properties || !obj.geometry) return;
    var type = obj.properties.get('type');
    if (!type || type === 'cable' || type === 'cableLabel' || type === 'region') return;
    mapHoverCardFollowObj = obj;
    var coords = null;
    try {
        coords = obj.geometry.getCoordinates();
    } catch (e) {
        return;
    }
    if (!coords) return;
    updateCursorIndicator({ fake: true }, type, coords, obj, false);
}
window.followMapHoverCardDuringDrag = followMapHoverCardDuringDrag;

function stopMapHoverCardDragFollow(obj) {
    if (obj && mapHoverCardFollowObj && mapHoverCardFollowObj !== obj) return;
    var was = mapHoverCardFollowObj;
    mapHoverCardFollowObj = null;
    if (!was) return;

    // Оставить карточку на финальной позиции объекта
    try {
        if (was.properties && was.geometry) {
            var type = was.properties.get('type');
            updateCursorIndicator({ fake: true }, type, was.geometry.getCoordinates(), was, false);
        }
    } catch (e) {}

    // Скрыть при следующем движении мыши, если объект больше не под курсором
    var dismiss = function() {
        document.removeEventListener('mousemove', dismiss, true);
        if (mapHoverCardFollowObj) return;
        if (typeof hoveredObject !== 'undefined' && hoveredObject === was) return;
        updateCursorIndicator(null, null);
    };
    document.addEventListener('mousemove', dismiss, true);
}
window.stopMapHoverCardDragFollow = stopMapHoverCardDragFollow;

function isMapHoverCardDragFollowing(obj) {
    return !!(mapHoverCardFollowObj && (!obj || mapHoverCardFollowObj === obj));
}

/** Скрыть описание при pan/zoom карты (в просмотре mouseleave часто не приходит). */
function clearMapHoverOnMapGesture() {
    if (mapHoverCardFollowObj || window.syncDragInProgress) return;
    if (typeof hoveredObject !== 'undefined' && hoveredObject) {
        clearHoverHighlight();
        return;
    }
    if (cursorIndicator && cursorIndicator.style.display !== 'none') {
        updateCursorIndicator(null, null);
    }
}
window.clearMapHoverOnMapGesture = clearMapHoverOnMapGesture;

/** Обновить карточку, если сейчас наведен тот же объект (после опроса Zabbix). */
function refreshMapHoverCardIfNeeded(obj) {
    if (!cursorIndicator || cursorIndicator.style.display === 'none') return;
    if (!obj || !obj.properties) return;
    var uid = String(obj.properties.get('uniqueId') || '');
    if (!uid || cursorIndicator._hoverObjUid !== uid) return;
    var type = obj.properties.get('type');
    var coords = null;
    try {
        if (obj.geometry && typeof obj.geometry.getCoordinates === 'function') {
            coords = obj.geometry.getCoordinates();
        }
    } catch (e) {}
    updateCursorIndicator({ fake: true }, type, coords, obj, true);
}
window.refreshMapHoverCardIfNeeded = refreshMapHoverCardIfNeeded;

function updatePhantomPlacemark(type, coords) {
    if (!type || !coords) {
        removePhantomPlacemark();
        return;
    }

    var currentPhantomType = phantomPlacemark && phantomPlacemark.properties ? phantomPlacemark.properties.get('phantomType') : null;
    if (phantomPlacemark && currentPhantomType === type) {
        phantomPlacemark.geometry.setCoordinates(coords);
        return;
    }
    removePhantomPlacemark();

    var phantomIcon = buildMapPlacemarkIcon(type, 'phantom', type === 'node' ? { nodeKind: currentPlacementNodeKind } : null);
    if (!phantomIcon) return;

    phantomPlacemark = new ymaps.Placemark(coords, {
        type: 'phantom',
        phantomType: type,
        balloonContent: ''
    }, {
        iconLayout: 'default#image',
        iconImageHref: phantomIcon.href,
        iconImageSize: phantomIcon.iconImageSize,
        iconImageOffset: phantomIcon.iconImageOffset,
        iconImageOpacity: 0.7, 
        zIndex: 9999, 
        interactive: false, 
        cursor: 'crosshair',
        hasBalloon: false,
        openBalloonOnClick: false
    });
    
    myMap.geoObjects.add(phantomPlacemark);
}

function removePhantomPlacemark() {
    if (phantomPlacemark) {
        myMap.geoObjects.remove(phantomPlacemark);
        phantomPlacemark = null;
    }
}

function resolveCableFromMapTarget(target) {
    if (!target || !target.properties) return null;
    var type = target.properties.get('type');
    if (type === 'cable') return target;
    if (type === 'cableAerialOverlay') {
        var uid = target.properties.get('parentCableId');
        if (!uid || !Array.isArray(objects)) return null;
        for (var i = 0; i < objects.length; i++) {
            var o = objects[i];
            if (o && o.properties && o.properties.get('uniqueId') === uid && o.properties.get('type') === 'cable') {
                return o;
            }
        }
    }
    return null;
}

function handleCableMapClickEvent(cable, e) {
    if (objectPlacementMode) {
        var placeCoords = e && e.get ? e.get('coords') : null;
        if (!placeCoords && typeof window.lastMapClickCoords !== 'undefined') {
            placeCoords = window.lastMapClickCoords;
        }
        try {
            if (e && e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') {
                e.originalEvent.stopPropagation();
            }
            if (e && e.stopPropagation && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }
        } catch (eStop) {}
        if (placeCoords && Date.now() >= placementPanBlockClickUntil && typeof placeObjectAtCoords === 'function') {
            if (placeObjectAtCoords(placeCoords)) {
                // не дать handleMapClick поставить второй объект на тот же клик
                placementPanBlockClickUntil = Date.now() + 120;
            }
        }
        return false;
    }
    if (radioBridgeRoutingMode && radioBridgeRoutingData) {
        var rbCoords = e && e.get ? e.get('coords') : null;
        if (rbCoords && typeof handleRadioBridgeRoutingClick === 'function') {
            handleRadioBridgeRoutingClick(rbCoords);
        }
        return false;
    }
    try {
        if (e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') {
            e.originalEvent.stopPropagation();
        }
        if (e.stopPropagation && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
    } catch (error) {}
    if (cableSplitMode && cableSplitData) {
        var splitCoords = e.get && e.get('coords');
        if (splitCoords) {
            window.lastMapClickCoords = splitCoords;
            handleCableSplitMapClick(splitCoords, cable);
            return false;
        }
    }
    if (cableSplitSuppressInfoUntil && Date.now() < cableSplitSuppressInfoUntil) {
        return false;
    }
    showCableInfo(cable);
    return false;
}

function bindCableAerialOverlayEvents(overlay, cable) {
    if (!overlay || !cable || !overlay.events) return;
    overlay.events.add('click', function(e) {
        return handleCableMapClickEvent(cable, e);
    });
    function onEnter(e) {
        if (objectPlacementMode) return;
        var domEvent = e.get && e.get('domEvent');
        if (domEvent) {
            window.lastMouseX = domEvent.clientX || 0;
            window.lastMouseY = domEvent.clientY || 0;
        }
        if (hoveredObject && hoveredObject !== cable) clearHoverHighlight();
        highlightObjectOnHover(cable, e);
    }
    function onLeave() {
        if (hoveredObject === cable) clearHoverHighlight();
    }
    overlay.events.add('mouseenter', onEnter);
    overlay.events.add('mouseleave', onLeave);
    overlay.events.add('mouseover', onEnter);
    overlay.events.add('mouseout', onLeave);
}

function bindAllCableAerialOverlays(cable) {
    if (!cable || !cable.properties) return;
    var overlays = cable.properties.get('aerialOverlays');
    if (!Array.isArray(overlays)) return;
    overlays.forEach(function(ol) {
        bindCableAerialOverlayEvents(ol, cable);
    });
}

window.bindAllCableAerialOverlays = bindAllCableAerialOverlays;

function attachHoverEventsToObject(obj) {
    if (!obj || !obj.events) return;
    const objType = obj.properties ? obj.properties.get('type') : null;
    if (!objType || objType === 'cableLabel' || objType === 'cableAerialOverlay') return;
    
    function onMouseEnter(e) {
        const domEvent = e.get && e.get('domEvent');
        if (domEvent) {
            window.lastMouseX = domEvent.clientX || 0;
            window.lastMouseY = domEvent.clientY || 0;
        }
        // При размещении объектов кабель не подсвечиваем и фантом не убираем
        if (objectPlacementMode && objType === 'cable') return;
        if (objectPlacementMode && phantomPlacemark) {
            myMap.geoObjects.remove(phantomPlacemark);
            phantomPlacemark = null;
        }
        if (hoveredObject && hoveredObject !== obj) clearHoverHighlight();
        highlightObjectOnHover(obj, e);
    }
    function onMouseLeave() {
        // Во время перетаскивания карточка остаётся и следует за объектом
        if (isMapHoverCardDragFollowing(obj)) return;
        if (hoveredObject === obj) clearHoverHighlight();
    }
    obj.events.add('mouseenter', onMouseEnter);
    obj.events.add('mouseleave', onMouseLeave);
    obj.events.add('mouseover', onMouseEnter);
    obj.events.add('mouseout', onMouseLeave);
}

function highlightObjectOnHover(obj, e) {
    if (!obj || !obj.properties) {
        return;
    }

    if (selectedObjects.includes(obj)) {
        return;
    }

    const type = obj.properties.get('type');
    if (objectPlacementMode && (type === 'cable' || type === 'cableLabel')) {
        return;
    }
    
    hoveredObject = obj;

    const objCoord = (type === 'cable' || type === 'cableLabel') ? (e && e.get('coords') ? e.get('coords') : null) : (obj.geometry ? obj.geometry.getCoordinates() : null);
    updateCursorIndicator(e, type, objCoord, obj);

    if (type === 'cable' || type === 'cableLabel') {
        
        showHoverCircle(obj, e);
        
        highlightCableOnHover(obj);
        return;
    }

    if (type === 'node') {
        showHoverCircle(obj, e);
        return;
    }

    var hoverIconTypes = ['support', 'sleeve', 'cross', 'crossGroup', 'nodeGroup', 'olt', 'splitter', 'onu', 'switch', 'camera', 'mediaConverter', 'attachment', 'manhole', 'signalPost', 'cabinet'];
    if (hoverIconTypes.indexOf(type) < 0) return;

    var hoverIcon = buildMapPlacemarkIcon(type, 'hover', obj);
    if (!hoverIcon) return;

    hoveredObjectOriginalIcon = {
        href: obj.options.get('iconImageHref'),
        size: obj.options.get('iconImageSize'),
        offset: obj.options.get('iconImageOffset')
    };

    obj.options.set({
        iconImageHref: hoverIcon.href,
        iconImageSize: hoverIcon.iconImageSize,
        iconImageOffset: hoverIcon.iconImageOffset
    });
    
    showHoverCircle(obj, e);
}

function showHoverCircle(obj, e) {
    if (!obj || !obj.geometry) return;

    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
    
    const type = obj.properties ? obj.properties.get('type') : null;

    if (type === 'cable') {
        if (!e) return;
        
        const coords = e.get('coords');
        var geoms = (window.CableUnderground && CableUnderground.getCableDisplayGeometries)
            ? CableUnderground.getCableDisplayGeometries(obj)
            : [obj.geometry.getCoordinates()];
        var nearestPoint = null;
        var bestDist = Infinity;
        for (var gi = 0; gi < geoms.length; gi++) {
            var geom = geoms[gi];
            if (!geom || geom.length < 2) continue;
            var projected = projectPointOntoPolyline(coords, geom);
            if (projected && projected.distance < bestDist) {
                bestDist = projected.distance;
                nearestPoint = projected.point;
            }
        }
        if (!nearestPoint) return;

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
    } else {
        
        const coords = obj.geometry.getCoordinates();

        const zoom = myMap.getZoom();
        const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00018 : 0.00012);

        let fillColor = 'rgba(59, 130, 246, 0.15)';
        let strokeColor = '#3b82f6';
        let strokeWidth = 2.5;
        const isGroup = type === 'crossGroup' || type === 'nodeGroup';
        
        if (type === 'node') {
            const nodeKind = obj.properties.get('nodeKind') || 'network';
            if (nodeKind === 'aggregation') {
                strokeColor = '#ef4444';
                fillColor = 'rgba(239, 68, 68, 0.18)';
            } else {
                strokeColor = '#22c55e';
                fillColor = 'rgba(34, 197, 94, 0.18)';
            }
        } else if (isGroup) {
            fillColor = 'rgba(59, 130, 246, 0.25)';
            strokeWidth = 4;
        }
        
        hoverCircle = new ymaps.Circle([coords, radius], {}, {
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
            strokeStyle: 'solid',
            zIndex: isGroup ? 9999 : 999
        });
        
        myMap.geoObjects.add(hoverCircle);
    }
}

function removeHoverCircle() {
    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
}

function highlightCableOnHover(cable) {
    if (!cable || !cable.properties) return;

    if (!cable.properties.get('originalCableOptions')) {
        const originalOptions = {
            strokeWidth: cable.options.get('strokeWidth'),
            strokeColor: cable.options.get('strokeColor'),
            strokeOpacity: cable.options.get('strokeOpacity')
        };
        cable.properties.set('originalCableOptions', originalOptions);
    }

    const cableType = cable.properties.get('cableType');
    const normalWidth = getCableWidth(cableType);
    const normalColor = getCableColor(cableType);
    
    cable.options.set({
        strokeWidth: normalWidth * 1.8,
        strokeColor: '#60a5fa', 
        strokeOpacity: 0.95,
        zIndex: 998
    });
    if (window.CableUnderground && CableUnderground.syncAerialOverlayStroke) {
        CableUnderground.syncAerialOverlayStroke(cable);
    }
}

function clearCableHoverHighlight(cable) {
    if (!cable || !cable.properties) return;
    
    const originalOptions = cable.properties.get('originalCableOptions');
    if (originalOptions) {
        cable.options.set({
            strokeWidth: originalOptions.strokeWidth,
            strokeColor: originalOptions.strokeColor,
            strokeOpacity: originalOptions.strokeOpacity,
            zIndex: CABLE_MAP_Z_INDEX
        });
        cable.properties.unset('originalCableOptions');
        if (window.CableUnderground && CableUnderground.syncAerialOverlayStroke) {
            CableUnderground.syncAerialOverlayStroke(cable);
        }
    }
}

function clearHoverHighlight() {
    var keepCard = isMapHoverCardDragFollowing(hoveredObject) ||
        (mapHoverCardFollowObj && window.syncDragInProgress);

    if (hoveredObject) {
        const type = hoveredObject.properties ? hoveredObject.properties.get('type') : null;
        
        if (type === 'cable') {
            
            clearCableHoverHighlight(hoveredObject);
        } else if (hoveredObjectOriginalIcon) {
            
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
    if (!keepCard) {
        updateCursorIndicator(null, null);
    }
}
