/**
 * Ящики (cabinet): контейнер для кроссов, узлов, OLT и др.
 */
var CABINET_MEMBER_TYPES = ['cross', 'node', 'olt', 'mediaConverter', 'camera', 'onu'];
var CABINET_EXTRACT_OFFSET = 0.00008;

var CABINET_MEMBER_BADGE = {
    cross: 'violet',
    node: 'green',
    olt: 'sky',
    mediaConverter: 'teal',
    camera: 'slate',
    splitter: 'purple',
    onu: 'cyan'
};

function canBeCabinetMember(type) {
    return CABINET_MEMBER_TYPES.indexOf(type) !== -1;
}

function getObjectCabinetId(obj) {
    if (!obj || !obj.properties) return '';
    var id = obj.properties.get('cabinetId');
    return id != null && id !== '' ? String(id) : '';
}

function getObjectCabinetUid(obj) {
    if (!obj || !obj.properties) return null;
    if (obj.properties.get('type') === 'cabinet') return getObjectUniqueId(obj);
    var cabId = getObjectCabinetId(obj);
    return cabId || null;
}

function getObjectRoutingCoords(obj) {
    if (!obj) return null;
    if (obj.geometry && typeof obj.geometry.getCoordinates === 'function') {
        try {
            var coords = obj.geometry.getCoordinates();
            if (coords && coords.length >= 2 && !Array.isArray(coords[0])) {
                return coords;
            }
        } catch (e) {}
    }
    var cabId = getObjectCabinetId(obj);
    if (!cabId) return null;
    var cabinet = getCabinetByUid(cabId);
    if (!cabinet || !cabinet.geometry || typeof cabinet.geometry.getCoordinates !== 'function') return null;
    try {
        var cabCoords = cabinet.geometry.getCoordinates();
        if (cabCoords && cabCoords.length >= 2 && !Array.isArray(cabCoords[0])) {
            return cabCoords;
        }
    } catch (eCab) {}
    return null;
}

function hasObjectRoutingCoords(obj) {
    return !!getObjectRoutingCoords(obj);
}

function isSameCabinetAsObject(obj, cabinetUid) {
    if (!obj || !cabinetUid) return false;
    return getObjectCabinetUid(obj) === String(cabinetUid);
}

function getAllCabinets() {
    if (!Array.isArray(objects)) return [];
    return objects.filter(function(o) {
        return o && o.properties && o.properties.get('type') === 'cabinet';
    });
}

function getCabinetByUid(uid) {
    if (!uid) return null;
    return getMapObjectByUid(uid, 'cabinet');
}

function getCabinetMembers(cabinetUid) {
    if (!cabinetUid || !Array.isArray(objects)) return [];
    return objects.filter(function(o) {
        if (!o || !o.properties) return false;
        return getObjectCabinetId(o) === String(cabinetUid);
    });
}

function getCabinetMembersForDisplay(cabinetUid) {
    return getCabinetMembers(cabinetUid).filter(function(o) {
        return o && o.properties && canBeCabinetMember(o.properties.get('type'));
    });
}

function getCabinetDisplayName(cabinet) {
    if (!cabinet || !cabinet.properties) return 'Ящик';
    var name = (cabinet.properties.get('name') || '').trim();
    if (name) return name;
    var mfr = (cabinet.properties.get('manufacturer') || '').trim();
    var model = (cabinet.properties.get('model') || '').trim();
    if (mfr && model) return mfr + ' ' + model;
    if (model) return model;
    return 'Ящик';
}

var CABINET_MOUNT_LABELS = {
    pole: 'На опоре',
    wall: 'На стене',
    ground: 'На земле / фундамент',
    indoor: 'В помещении',
    manhole: 'В колодце',
    rack: 'В стойке'
};

function getCabinetMountLabel(mount) {
    var key = (mount || '').trim();
    return key ? (CABINET_MOUNT_LABELS[key] || key) : '';
}

function getCabinetMountSelectOptionsHtml(selectedValue) {
    var sel = (selectedValue != null && selectedValue !== '') ? String(selectedValue) : '';
    var html = '<option value=""' + (!sel ? ' selected' : '') + '>— не указано —</option>';
    Object.keys(CABINET_MOUNT_LABELS).forEach(function(key) {
        html += '<option value="' + escapeHtml(key) + '"' + (key === sel ? ' selected' : '') + '>' + escapeHtml(CABINET_MOUNT_LABELS[key]) + '</option>';
    });
    if (sel && !CABINET_MOUNT_LABELS[sel]) {
        html += '<option value="' + escapeHtml(sel) + '" selected>' + escapeHtml(sel) + '</option>';
    }
    return html;
}

function getCabinetPlacementOptionsFromForm() {
    return {
        manufacturer: (document.getElementById('cabinetManufacturer') && document.getElementById('cabinetManufacturer').value) ? document.getElementById('cabinetManufacturer').value.trim() : '',
        model: (document.getElementById('cabinetModel') && document.getElementById('cabinetModel').value) ? document.getElementById('cabinetModel').value.trim() : '',
        cabinetMount: (document.getElementById('cabinetMount') && document.getElementById('cabinetMount').value) ? document.getElementById('cabinetMount').value.trim() : '',
        cabinetHeight: parseCabinetDimensionValue(document.getElementById('cabinetHeight') && document.getElementById('cabinetHeight').value),
        cabinetWidth: parseCabinetDimensionValue(document.getElementById('cabinetWidth') && document.getElementById('cabinetWidth').value),
        cabinetUnits: parseCabinetDimensionValue(document.getElementById('cabinetUnits') && document.getElementById('cabinetUnits').value),
        address: (document.getElementById('cabinetAddress') && document.getElementById('cabinetAddress').value) ? document.getElementById('cabinetAddress').value.trim() : '',
        inventoryNumber: (document.getElementById('cabinetInventoryNumber') && document.getElementById('cabinetInventoryNumber').value) ? document.getElementById('cabinetInventoryNumber').value.trim() : '',
        serialNumber: (document.getElementById('cabinetSerialNumber') && document.getElementById('cabinetSerialNumber').value) ? document.getElementById('cabinetSerialNumber').value.trim() : '',
        comment: (document.getElementById('cabinetComment') && document.getElementById('cabinetComment').value) ? document.getElementById('cabinetComment').value.trim() : ''
    };
}

function parseCabinetDimensionValue(raw) {
    if (raw == null || raw === '') return '';
    var n = parseInt(String(raw).trim(), 10);
    return isNaN(n) || n < 0 ? '' : String(n);
}

function formatCabinetDimensionsSummary(cabinet) {
    if (!cabinet || !cabinet.properties) return '';
    var parts = [];
    var h = parseCabinetDimensionValue(cabinet.properties.get('cabinetHeight'));
    var w = parseCabinetDimensionValue(cabinet.properties.get('cabinetWidth'));
    var u = parseCabinetDimensionValue(cabinet.properties.get('cabinetUnits'));
    if (w) parts.push(w + ' мм');
    if (h) parts.push(h + ' мм');
    if (u) parts.push(u + ' U');
    return parts.join(' × ');
}

function buildCabinetDimensionsFieldsHtml(prefix, values) {
    prefix = prefix || 'editCabinet';
    values = values || {};
    var html = '<fieldset class="cabinet-dims-block">';
    html += '<legend class="cabinet-dims-legend">Габариты</legend>';
    html += '<div class="cabinet-dims-grid">';
    html += '<label class="cabinet-dims-cell" for="' + prefix + 'Width">';
    html += '<span class="cabinet-dims-cell-label">Ширина</span>';
    html += '<span class="cabinet-dims-input-wrap">';
    html += '<input type="number" id="' + prefix + 'Width" class="form-input cabinet-dims-input" min="0" step="1" inputmode="numeric" value="' + escapeHtml(values.width || '') + '" placeholder="0">';
    html += '<span class="cabinet-dims-unit" aria-hidden="true">мм</span></span></label>';
    html += '<label class="cabinet-dims-cell" for="' + prefix + 'Height">';
    html += '<span class="cabinet-dims-cell-label">Высота</span>';
    html += '<span class="cabinet-dims-input-wrap">';
    html += '<input type="number" id="' + prefix + 'Height" class="form-input cabinet-dims-input" min="0" step="1" inputmode="numeric" value="' + escapeHtml(values.height || '') + '" placeholder="0">';
    html += '<span class="cabinet-dims-unit" aria-hidden="true">мм</span></span></label>';
    html += '<label class="cabinet-dims-cell cabinet-dims-cell--units" for="' + prefix + 'Units">';
    html += '<span class="cabinet-dims-cell-label">Стойка</span>';
    html += '<span class="cabinet-dims-input-wrap">';
    html += '<input type="number" id="' + prefix + 'Units" class="form-input cabinet-dims-input" min="0" step="1" inputmode="numeric" value="' + escapeHtml(values.units || '') + '" placeholder="0" title="Высота в юнитах стойки (U)">';
    html += '<span class="cabinet-dims-unit" aria-hidden="true">U</span></span></label>';
    html += '</div>';
    html += '<p class="cabinet-dims-hint">Необязательно — для документации</p>';
    html += '</fieldset>';
    return html;
}

function getCabinetMemberTypeLabel(type) {
    if (typeof getObjectTypeName === 'function') return getObjectTypeName(type);
    return type || 'Объект';
}

function getCabinetMemberSummary(member) {
    if (!member || !member.properties) return 'Объект';
    var type = member.properties.get('type');
    var name = (member.properties.get('name') || '').trim();
    var label = getCabinetMemberTypeLabel(type);
    return name ? (label + ': ' + name) : label;
}

function getCabinetMemberBadgeTone(type) {
    return CABINET_MEMBER_BADGE[type] || 'default';
}

function countCablesForObject(obj) {
    if (!obj || !Array.isArray(objects)) return 0;
    return objects.filter(function(cable) {
        if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        return from === obj || to === obj;
    }).length;
}

function summarizeCabinetMembers(members) {
    var counts = {};
    members.forEach(function(m) {
        if (!m || !m.properties) return;
        var t = m.properties.get('type');
        counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
}

function findCabinetAtCoords(coords, excludeObj) {
    if (!coords || coords.length < 2 || !Array.isArray(objects)) return null;
    var best = null;
    var bestDist = Infinity;
    objects.forEach(function(obj) {
        if (!obj || !obj.geometry || !obj.properties) return;
        if (excludeObj && obj === excludeObj) return;
        if (obj.properties.get('type') !== 'cabinet') return;
        var objCoords = obj.geometry.getCoordinates();
        if (!objCoords || objCoords.length < 2) return;
        if (typeof coordsWithinGroupMergeDistance === 'function') {
            if (!coordsWithinGroupMergeDistance(coords, objCoords)) return;
        } else if (groupKey(coords) !== groupKey(objCoords)) {
            return;
        }
        var dx = coords[0] - objCoords[0];
        var dy = coords[1] - objCoords[1];
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            best = obj;
        }
    });
    return best;
}

function isCabinetCableEndpointType(type) {
    return type === 'cross' || type === 'sleeve' || type === 'olt';
}

var cabinetCableSourceHighlight = null;

function syncCabinetCableSourceHighlight() {
    clearCabinetCableSourceHighlight();
    if (!cableSource || typeof getObjectCabinetId !== 'function') return;
    var cabId = getObjectCabinetId(cableSource);
    if (!cabId) return;
    var cabinet = getCabinetByUid(cabId);
    if (!cabinet) return;
    cabinetCableSourceHighlight = cabinet;
    if (typeof applyMapPlacemarkIcon === 'function') {
        applyMapPlacemarkIcon(cabinet, 'cabinet', 'selected', cabinet);
    }
}

function clearCabinetCableSourceHighlight() {
    if (!cabinetCableSourceHighlight) return;
    var cabinet = cabinetCableSourceHighlight;
    cabinetCableSourceHighlight = null;
    if (typeof applyMapPlacemarkIcon === 'function') {
        applyMapPlacemarkIcon(cabinet, 'cabinet', 'normal', cabinet);
    }
}

function notifyCableLayingSourceInCabinet() {
    if (!cableSource || !getObjectCabinetId(cableSource)) return;
    var cabinet = getCabinetByUid(getObjectCabinetId(cableSource));
    var memberName = (cableSource.properties.get('name') || '').trim() ||
        getCabinetMemberTypeLabel(cableSource.properties.get('type'));
    var cabName = cabinet ? getCabinetDisplayName(cabinet) : 'ящик';
    if (typeof showInfo === 'function') {
        showInfo('Кабель от «' + memberName + '» (' + cabName + '). Выберите конечную точку на карте или другой ящик.', 'Прокладка кабеля');
    }
}

function processCabinetMemberCableAction(member) {
    if (!member || !member.properties || !isCabinetCableEndpointType(member.properties.get('type'))) return false;
    if (!currentCableTool) return false;
    var modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    if (typeof processFiberCableEndpointClick === 'function') {
        processFiberCableEndpointClick(member);
    }
    return true;
}

function getCabinetCableEndpointMembers(cabinet, opts) {
    opts = opts || {};
    if (!cabinet) return [];
    var members = getCabinetMembers(getObjectUniqueId(cabinet)).filter(function(m) {
        if (!m || !m.properties) return false;
        return isCabinetCableEndpointType(m.properties.get('type'));
    });
    if (opts.excludeObject) {
        members = members.filter(function(m) { return m !== opts.excludeObject; });
    }
    return members;
}

function syncAllCabinetMembersToCabinets(opts) {
    opts = opts || {};
    if (!Array.isArray(objects)) return 0;
    var cabinetsByUid = Object.create(null);
    objects.forEach(function(o) {
        if (!o || !o.properties || o.properties.get('type') !== 'cabinet') return;
        var uid = getObjectUniqueId(o);
        if (uid) cabinetsByUid[uid] = o;
    });
    var moved = 0;
    var toRefreshCables = [];
    objects.forEach(function(member) {
        if (!member || !member.properties || !member.geometry) return;
        var cabId = getObjectCabinetId(member);
        if (!cabId || !cabinetsByUid[cabId]) return;
        var cabinet = cabinetsByUid[cabId];
        if (!cabinet.geometry) return;
        var cabCoords = cabinet.geometry.getCoordinates();
        if (!cabCoords || cabCoords.length < 2) return;
        var memCoords = member.geometry.getCoordinates();
        var needsMove = !memCoords || memCoords.length < 2 ||
            Math.abs(memCoords[0] - cabCoords[0]) > 1e-10 ||
            Math.abs(memCoords[1] - cabCoords[1]) > 1e-10;
        if (!needsMove) return;
        moveObjectToCoords(member, cabCoords.slice());
        toRefreshCables.push(member);
        moved++;
    });
    toRefreshCables.forEach(function(m) {
        if (typeof updateConnectedCables === 'function') updateConnectedCables(m);
    });
    if (moved && !opts.skipDisplay && typeof updateCabinetDisplay === 'function') {
        updateCabinetDisplay({ skipMemberSync: true });
    }
    return moved;
}

function tryProcessCabinetCableClick(clickedObject, onTarget) {
    if (!clickedObject || typeof resolveCabinetCableTarget !== 'function' || typeof onTarget !== 'function') return false;
    var type = clickedObject.properties && clickedObject.properties.get('type');
    var cabinet = null;
    if (type === 'cabinet') cabinet = clickedObject;
    else if (getObjectCabinetId(clickedObject)) cabinet = getCabinetByUid(getObjectCabinetId(clickedObject));
    if (!cabinet) return false;
    var exclude = null;
    if (cableSource && getObjectCabinetId(cableSource) === getObjectUniqueId(cabinet)) {
        exclude = cableSource;
    }
    resolveCabinetCableTarget(cabinet, onTarget, { excludeObject: exclude });
    return true;
}

function closeCabinetCablePickModal() {
    var el = document.getElementById('cabinetCablePickModal');
    if (el) el.remove();
    document.removeEventListener('keydown', cabinetCablePickEscHandler);
}

function cabinetCablePickEscHandler(e) {
    if (e.key === 'Escape') closeCabinetCablePickModal();
}

function buildCabinetCablePickModalHtml(title, cabinet, members) {
    var cabName = getCabinetDisplayName(cabinet);
    var html = '<div class="modal-content node-selection-modal-content cabinet-cable-pick-modal-content">';
    html += '<div class="network-map-balloon cabinet-cable-pick-balloon panel-glass">';
    html += '<div class="panel-glass-bg" aria-hidden="true">';
    html += '<div class="panel-glass-gradient"></div>';
    html += '<canvas class="panel-plexus-canvas"></canvas>';
    html += '</div>';
    html += '<div class="group-balloon-header">';
    html += '<span class="group-balloon-title">' + escapeHtml(title) + '</span>';
    html += '<button type="button" class="group-balloon-close cabinet-cable-pick-close" aria-label="Закрыть">&times;</button>';
    html += '</div>';
    html += '<div class="cabinet-cable-pick-lead">';
    html += '<span class="cabinet-cable-pick-lead-label">Ящик</span>';
    html += '<span class="cabinet-cable-pick-lead-name">' + escapeHtml(cabName) + '</span>';
    html += '</div>';
    html += '<div class="group-balloon-list cabinet-cable-pick-list">';
    members.forEach(function(m, idx) {
        var type = m.properties.get('type');
        var tone = getCabinetMemberBadgeTone(type);
        var name = (m.properties.get('name') || '').trim() || 'Без имени';
        var cableCount = typeof countCablesForObject === 'function' ? countCablesForObject(m) : 0;
        html += '<button type="button" class="cabinet-cable-pick-item cabinet-member-row" data-member-idx="' + idx + '">';
        html += '<div class="cabinet-member-row-main">';
        if (window.MapIcons) {
            html += '<span class="cabinet-member-icon" aria-hidden="true">' + MapIcons.buildIconSvg(type, { variant: 'normal', nodeKind: m.properties.get('nodeKind') }) + '</span>';
        }
        html += '<div class="cabinet-member-text">';
        html += '<span class="cabinet-member-badge cabinet-member-badge--' + tone + '">' + escapeHtml(getCabinetMemberTypeLabel(type)) + '</span>';
        html += '<span class="cabinet-member-name">' + escapeHtml(name) + '</span>';
        html += '</div></div>';
        html += '<span class="cabinet-member-cables">' + cableCount + ' каб.</span>';
        html += '</button>';
    });
    html += '</div></div></div>';
    return html;
}

function openCabinetCableMemberPicker(cabinet, members, onPick, opts) {
    opts = opts || {};
    if (!cabinet || !members || !members.length || typeof onPick !== 'function') return;
    if (members.length === 1) {
        onPick(members[0]);
        return;
    }
    closeCabinetCablePickModal();
    if (myMap && myMap.balloon) {
        try { myMap.balloon.close(); } catch (err) {}
    }
    var title = opts.title || 'Выберите объект в ящике';
    title = title.replace(/:$/, '');
    var overlay = document.createElement('div');
    overlay.id = 'cabinetCablePickModal';
    overlay.className = 'modal modal--centered cabinet-cable-pick-modal';
    overlay.style.display = 'flex';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = buildCabinetCablePickModalHtml(title, cabinet, members);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeCabinetCablePickModal();
    });
    var panel = overlay.querySelector('.cabinet-cable-pick-balloon');
    if (panel) {
        panel.addEventListener('click', function(e) { e.stopPropagation(); });
    }
    var closeBtn = overlay.querySelector('.cabinet-cable-pick-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            closeCabinetCablePickModal();
        });
    }
    overlay.querySelectorAll('.cabinet-cable-pick-item').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(btn.getAttribute('data-member-idx'), 10);
            closeCabinetCablePickModal();
            if (!isNaN(idx) && members[idx]) onPick(members[idx]);
        });
    });
    document.addEventListener('keydown', cabinetCablePickEscHandler);
    if (typeof window.initPanelPlexusCanvases === 'function') {
        requestAnimationFrame(function() { window.initPanelPlexusCanvases(overlay); });
    }
    var firstItem = overlay.querySelector('.cabinet-cable-pick-item');
    if (firstItem) firstItem.focus();
}

function resolveCabinetCableTarget(cabinet, onResolved, opts) {
    opts = opts || {};
    if (!cabinet || typeof onResolved !== 'function') return;
    var members = getCabinetCableEndpointMembers(cabinet, opts);
    if (!members.length) {
        if (typeof showWarning === 'function') {
            var msg = cableSource
                ? 'В ящике нет другого кросса для подключения.'
                : 'В ящике нет кросса для подключения кабеля.';
            showWarning(msg, 'Кабель');
        }
        onResolved(null);
        return;
    }
    var pickerTitle = !cableSource
        ? 'Начать кабель от объекта в ящике'
        : 'Подключить кабель к объекту в ящике';
    openCabinetCableMemberPicker(cabinet, members, onResolved, { title: pickerTitle });
}

function getEligibleCabinetMemberCandidates(cabinet) {
    if (!cabinet) return [];
    var cabUid = getObjectUniqueId(cabinet);
    var list = [];
    objects.forEach(function(obj) {
        if (!obj || !obj.properties || !obj.geometry) return;
        var type = obj.properties.get('type');
        if (type === 'cable' || type === 'cableLabel') return;
        if (!canBeCabinetMember(type)) return;
        if (getObjectCabinetId(obj)) return;
        if (getObjectUniqueId(obj) === cabUid) return;
        list.push(obj);
    });
    list.sort(function(a, b) {
        var la = getCabinetMemberTypeLabel(a.properties.get('type')) + ' ' + ((a.properties.get('name') || '').trim() || 'Без имени');
        var lb = getCabinetMemberTypeLabel(b.properties.get('type')) + ' ' + ((b.properties.get('name') || '').trim() || 'Без имени');
        return la.localeCompare(lb, 'ru');
    });
    return list;
}

function buildCabinetPickListHtml(candidates) {
    if (!candidates.length) return '';
    var html = '<div class="cabinet-pick-list">';
    candidates.forEach(function(obj) {
        var type = obj.properties.get('type');
        var uid = getObjectUniqueId(obj);
        var tone = getCabinetMemberBadgeTone(type);
        var name = (obj.properties.get('name') || '').trim() || 'Без имени';
        html += '<div class="cabinet-pick-row">';
        html += '<div class="cabinet-pick-row-main">';
        if (window.MapIcons) {
            html += '<span class="cabinet-member-icon" aria-hidden="true">' + MapIcons.buildIconSvg(type, { variant: 'normal', nodeKind: obj.properties.get('nodeKind') }) + '</span>';
        }
        html += '<span class="cabinet-member-badge cabinet-member-badge--' + tone + '">' + escapeHtml(getCabinetMemberTypeLabel(type)) + '</span>';
        html += '<span class="cabinet-pick-name">' + escapeHtml(name) + '</span>';
        html += '</div>';
        html += '<button type="button" class="btn-cabinet-pick-add" data-member-uid="' + escapeHtml(uid) + '" title="Добавить в ящик" aria-label="Добавить">+</button>';
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function getCabinetCreateCatalogKind(type) {
    if (type === 'olt') return 'olt';
    if (type === 'onu') return 'onu';
    if (type === 'camera') return 'camera';
    if (type === 'mediaConverter') return 'node';
    return null;
}

function buildCabinetCreateDeviceComboboxHtml(catalogKind) {
    if (!catalogKind) return '';
    var html = '';
    html += '<label class="object-card-label" for="cabinetCreateMfrTrigger">Производитель</label>';
    html += '<div class="device-combobox" data-catalog="' + escapeHtml(catalogKind) + '" data-type="manufacturer" data-value-id="cabinetCreateMfr">';
    html += '<button type="button" class="device-combobox-trigger" id="cabinetCreateMfrTrigger" aria-expanded="false" aria-haspopup="listbox">Выберите производителя</button>';
    html += '<input type="hidden" id="cabinetCreateMfr" value="">';
    html += '<div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div>';
    html += '</div>';
    html += '<label class="object-card-label" for="cabinetCreateModelTrigger">Модель</label>';
    html += '<div class="device-combobox" data-catalog="' + escapeHtml(catalogKind) + '" data-type="model" data-value-id="cabinetCreateModel" data-manufacturer-id="cabinetCreateMfr">';
    html += '<button type="button" class="device-combobox-trigger" id="cabinetCreateModelTrigger" aria-expanded="false" aria-haspopup="listbox">Выберите модель</button>';
    html += '<input type="hidden" id="cabinetCreateModel" value="">';
    html += '<div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div>';
    html += '</div>';
    return html;
}

function buildCabinetCreateFieldsHtml(type) {
    var html = '';
    if (type === 'cross') {
        html += '<label class="object-card-label" for="cabinetCreateCrossType">Тип кросса</label>';
        html += '<select id="cabinetCreateCrossType" class="form-select">';
        html += typeof getCrossTypeSelectOptionsHtml === 'function'
            ? getCrossTypeSelectOptionsHtml('SNR-ODF-W24')
            : '<option value="SNR-ODF-W24" selected>SNR-ODF-W24</option>';
        html += '</select>';
    } else if (type === 'node') {
        html += '<label class="object-card-label" for="cabinetCreateNodeKind">Тип узла</label>';
        html += '<select id="cabinetCreateNodeKind" class="form-select">';
        html += '<option value="network">Узел сети</option>';
        html += '<option value="aggregation">Узел агрегации</option>';
        html += '</select>';
    } else if (type === 'olt') {
        html += '<label class="object-card-label" for="cabinetCreatePonPorts">PON-портов</label>';
        html += '<select id="cabinetCreatePonPorts" class="form-select">';
        [4, 8, 16, 32, 64].forEach(function(n) {
            html += '<option value="' + n + '"' + (n === 8 ? ' selected' : '') + '>' + n + '</option>';
        });
        html += '</select>';
        html += buildCabinetCreateDeviceComboboxHtml('olt');
    } else if (type === 'onu' || type === 'camera' || type === 'mediaConverter') {
        html += buildCabinetCreateDeviceComboboxHtml(getCabinetCreateCatalogKind(type));
    }
    return html;
}

function collectCabinetCreateOptions(root, type) {
    var opts = {};
    if (type === 'cross') {
        var ct = root.querySelector('#cabinetCreateCrossType');
        var crossType = ct ? ct.value : 'SNR-ODF-W24';
        opts.crossType = crossType;
        opts.crossPorts = typeof getDefaultPortsForCrossType === 'function' ? getDefaultPortsForCrossType(crossType) : 24;
        opts.crossCopperPorts = 0;
    } else if (type === 'node') {
        var nk = root.querySelector('#cabinetCreateNodeKind');
        opts.nodeKind = nk ? nk.value : 'network';
    } else if (type === 'olt') {
        var pp = root.querySelector('#cabinetCreatePonPorts');
        opts.ponPorts = pp ? (parseInt(pp.value, 10) || 8) : 8;
        var mfr = root.querySelector('#cabinetCreateMfr');
        var mod = root.querySelector('#cabinetCreateModel');
        if (mfr && mfr.value) opts.manufacturer = mfr.value.trim();
        if (mod && mod.value) opts.model = mod.value.trim();
    } else if (type === 'onu' || type === 'camera' || type === 'mediaConverter') {
        var mfr2 = root.querySelector('#cabinetCreateMfr');
        var mod2 = root.querySelector('#cabinetCreateModel');
        if (mfr2 && mfr2.value) opts.manufacturer = mfr2.value.trim();
        if (mod2 && mod2.value) opts.model = mod2.value.trim();
    }
    return opts;
}

function createCabinetMemberObject(cabinet, type, name, options) {
    if (!cabinet || !cabinet.geometry) {
        if (typeof showError === 'function') showError('Ящик не найден', 'Ящик');
        return null;
    }
    if (!canBeCabinetMember(type)) {
        if (typeof showError === 'function') showError('Этот тип нельзя создать в ящике', 'Ящик');
        return null;
    }
    var coords = cabinet.geometry.getCoordinates();
    if (!coords || coords.length < 2) {
        if (typeof showError === 'function') showError('У ящика нет координат на карте', 'Ящик');
        return null;
    }
    if (type === 'node' && name && typeof findNodeByName === 'function' && findNodeByName(name)) {
        if (typeof showError === 'function') showError('Узел с таким именем уже существует', 'Дубликат');
        return null;
    }
    if (typeof wouldExceedMapObjectLimit === 'function' && wouldExceedMapObjectLimit(1)) {
        if (typeof notifyMapObjectLimitBlocked === 'function') notifyMapObjectLimitBlocked();
        return null;
    }
    var cabUid = getObjectUniqueId(cabinet);
    options = Object.assign({}, options || {}, { cabinetId: cabUid });
    var obj = createObject(type, name || '', coords.slice(), options);
    if (obj && typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
    return obj;
}

function buildCabinetMemberAddSectionHtml(cabinet, isEditMode) {
    if (!isEditMode || !cabinet) return '';
    var defaultType = 'cross';
    var candidates = getEligibleCabinetMemberCandidates(cabinet);
    var html = '<section class="object-card-section cabinet-card-add">';
    html += '<div class="object-card-section-head"><h4 class="object-card-section-title">Добавить оборудование</h4></div>';
    html += '<div class="cabinet-create-form">';
    html += '<label class="object-card-label" for="cabinetCreateType">Тип</label>';
    html += '<select id="cabinetCreateType" class="form-select">';
    CABINET_MEMBER_TYPES.forEach(function(t) {
        html += '<option value="' + escapeHtml(t) + '"' + (t === defaultType ? ' selected' : '') + '>' + escapeHtml(getCabinetMemberTypeLabel(t)) + '</option>';
    });
    html += '</select>';
    html += '<label class="object-card-label" for="cabinetCreateName">Имя</label>';
    html += '<input type="text" id="cabinetCreateName" class="form-input" placeholder="Необязательно">';
    html += '<div id="cabinetCreateFields" class="cabinet-create-fields">' + buildCabinetCreateFieldsHtml(defaultType) + '</div>';
    html += '<button type="button" class="btn-primary btn-cabinet-create-member" id="cabinetCreateBtn">Создать в ящике</button>';
    html += '</div>';
    if (candidates.length) {
        html += '<details class="cabinet-pick-details">';
        html += '<summary>Перенести с карты (' + candidates.length + ')</summary>';
        html += buildCabinetPickListHtml(candidates);
        html += '</details>';
    }
    html += '</section>';
    return html;
}

function resolvePlacementCoordsForCabinet(coords, type) {
    if (!canBeCabinetMember(type) || !coords) return coords;
    var atCabinet = findCabinetAtCoords(coords);
    if (atCabinet && atCabinet.geometry) {
        return atCabinet.geometry.getCoordinates().slice();
    }
    return coords;
}

function canPlaceMemberAtCoords(coords, type, atPoint) {
    if (!canBeCabinetMember(type)) return null;
    if (findCabinetAtCoords(coords)) return true;
    if (!atPoint.length) return true;

    var hasCabinet = atPoint.some(function(o) { return o.properties.get('type') === 'cabinet'; });
    if (hasCabinet) return true;

    var onlyCabinetMembers = atPoint.every(function(o) {
        var ot = o.properties.get('type');
        return ot === 'cabinet' || !!getObjectCabinetId(o);
    });
    if (onlyCabinetMembers) return true;

    var groupType = typeof getObjectPlacementGroupType === 'function' ? getObjectPlacementGroupType(type) : null;
    if (groupType) {
        return atPoint.every(function(obj) {
            var ot = obj.properties.get('type');
            return ot === groupType || ot === 'cabinet' || !!getObjectCabinetId(obj);
        });
    }
    return false;
}

function clearObjectCabinetId(obj) {
    if (!obj || !obj.properties) return;
    if (typeof obj.properties.unset === 'function') obj.properties.unset('cabinetId');
    else obj.properties.set('cabinetId', '');
}

function hidePlacemarkFromMap(obj) {
    if (!obj || !myMap) return;
    try { myMap.geoObjects.remove(obj); } catch (e) {}
    var label = obj.properties && obj.properties.get('label');
    if (label) try { myMap.geoObjects.remove(label); } catch (e2) {}
}

function showCabinetMemberOnMap(obj) {
    if (!obj || !myMap || !obj.properties) return;
    if (getObjectCabinetId(obj)) return;
    var type = obj.properties.get('type');
    if (!canBeCabinetMember(type)) return;
    // Кроссы и узлы снова отрисовывает updateCrossDisplay / updateNodeDisplay.
    if (type === 'cross' || type === 'node') return;

    try {
        if (myMap.geoObjects.indexOf(obj) === -1) myMap.geoObjects.add(obj);
    } catch (e) {}
    var label = obj.properties.get('label');
    if (label) {
        try {
            if (myMap.geoObjects.indexOf(label) === -1) myMap.geoObjects.add(label);
        } catch (e2) {}
    }
    if (type === 'camera' && typeof refreshCameraMapPresentation === 'function') {
        refreshCameraMapPresentation(obj);
    }
    if (typeof attachHoverEventsToObject === 'function') attachHoverEventsToObject(obj);
    if (typeof syncConnectionLinesForObject === 'function') {
        syncConnectionLinesForObject(obj);
    }
}

function moveObjectToCoords(obj, coords) {
    if (!obj || !obj.geometry || !coords || coords.length < 2) return;
    obj.geometry.setCoordinates(coords);
    var label = obj.properties && obj.properties.get('label');
    if (label && label.geometry) label.geometry.setCoordinates(coords);
}

function syncCabinetMemberCoords(cabinet) {
    if (!cabinet || !cabinet.geometry) return;
    var uid = getObjectUniqueId(cabinet);
    if (!uid) return;
    var coords = cabinet.geometry.getCoordinates();
    getCabinetMembers(uid).forEach(function(member) {
        moveObjectToCoords(member, coords);
        if (typeof updateConnectedCables === 'function') updateConnectedCables(member);
    });
}

function updateCabinetLabel(cabinet) {
    if (!cabinet || !cabinet.properties || cabinet.properties.get('type') !== 'cabinet') return;
    var uid = getObjectUniqueId(cabinet);
    var count = uid ? getCabinetMembersForDisplay(uid).length : 0;
    var name = (cabinet.properties.get('name') || '').trim();
    var labelText = name || 'Ящик';
    if (count > 0) labelText += ' (' + count + ')';
    if (typeof updateObjectLabel === 'function') updateObjectLabel(cabinet, labelText);
}

function updateCabinetDisplay(opts) {
    opts = opts || {};
    if (!opts.skipMemberSync && typeof syncAllCabinetMembersToCabinets === 'function') {
        syncAllCabinetMembersToCabinets({ skipDisplay: true });
    }
    if (!Array.isArray(objects)) return;

    objects.forEach(function(obj) {
        if (!obj || !obj.properties) return;
        if (!canBeCabinetMember(obj.properties.get('type'))) return;
        if (getObjectCabinetId(obj)) {
            hidePlacemarkFromMap(obj);
        } else {
            showCabinetMemberOnMap(obj);
        }
    });

    getAllCabinets().forEach(function(cabinet) {
        updateCabinetLabel(cabinet);
        if (!myMap) return;
        try { myMap.geoObjects.remove(cabinet); } catch (e) {}
        var lbl = cabinet.properties.get('label');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e2) {}
        if (typeof applyMapFilter === 'function') {
            var filterOn = true;
            if (typeof getMapFilterState === 'function') {
                var st = getMapFilterState();
                filterOn = !st || st.cabinet !== false;
            }
            if (filterOn) {
                try { myMap.geoObjects.add(cabinet); } catch (e3) {}
                if (lbl) try { myMap.geoObjects.add(lbl); } catch (e4) {}
            }
        } else {
            try { myMap.geoObjects.add(cabinet); } catch (e5) {}
            if (lbl) try { myMap.geoObjects.add(lbl); } catch (e6) {}
        }
    });

    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
}

function assignObjectToCabinet(member, cabinetUid, opts) {
    opts = opts || {};
    if (!member || !member.properties || !canBeCabinetMember(member.properties.get('type'))) {
        if (!opts.silent && typeof showError === 'function') showError('Этот тип объекта нельзя поместить в ящик.', 'Ящик');
        return false;
    }
    var cabinet = getCabinetByUid(cabinetUid);
    if (!cabinet || !cabinet.geometry) {
        if (!opts.silent && typeof showError === 'function') showError('Ящик не найден.', 'Ящик');
        return false;
    }
    if (getObjectUniqueId(member) === getObjectUniqueId(cabinet)) return false;

    var coords = cabinet.geometry.getCoordinates();
    member.properties.set('cabinetId', getObjectUniqueId(cabinet));
    moveObjectToCoords(member, coords);
    if (typeof updateConnectedCables === 'function') updateConnectedCables(member);

    hidePlacemarkFromMap(member);
    updateCabinetDisplay();
    if (!opts.skipSave) {
        if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(member);
        else if (typeof saveData === 'function') saveData({ object: member, syncImmediate: true });
    }
    if (!opts.silent && typeof showInfo === 'function') {
        showInfo('Объект помещён в ящик «' + getCabinetDisplayName(cabinet) + '»', 'Ящик');
    }
    return true;
}

function tryMergeMemberIntoCabinetByCoords(obj, coords, opts) {
    opts = opts || {};
    if (!obj || !canBeCabinetMember(obj.properties.get('type'))) return false;
    var cabinet = findCabinetAtCoords(coords || (obj.geometry && obj.geometry.getCoordinates()), obj);
    if (!cabinet) return false;
    return assignObjectToCabinet(obj, getObjectUniqueId(cabinet), Object.assign({ silent: opts.silent !== false, skipSave: opts.skipSave }, opts));
}

function finishMemberCabinetPlacement(obj) {
    if (!obj || !objectPlacementMode) return;
    tryMergeMemberIntoCabinetByCoords(obj, obj.geometry && obj.geometry.getCoordinates(), { silent: false, skipSave: false });
}

function removeObjectFromCabinet(member, offsetCoords) {
    if (!member || !member.properties) return false;
    if (!getObjectCabinetId(member)) return false;

    clearObjectCabinetId(member);
    if (offsetCoords && member.geometry) {
        var c = member.geometry.getCoordinates();
        if (c && c.length >= 2) {
            moveObjectToCoords(member, [c[0] + CABINET_EXTRACT_OFFSET, c[1]]);
        }
    }
    if (typeof updateConnectedCables === 'function') updateConnectedCables(member);

    updateCabinetDisplay();
    if (typeof updateStats === 'function') updateStats();
    if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(member);
    else if (typeof saveData === 'function') saveData({ object: member, syncImmediate: true });
    if (typeof showInfo === 'function') showInfo('Объект вынесен из ящика', 'Ящик');
    return true;
}

function releaseAllCabinetMembers(cabinetUid) {
    if (!cabinetUid) return;
    getCabinetMembers(cabinetUid).forEach(function(member) {
        clearObjectCabinetId(member);
    });
    updateCabinetDisplay();
}

function onCabinetDragEnd(cabinet) {
    if (!cabinet || !cabinet.geometry) return;
    syncCabinetMemberCoords(cabinet);
    updateCabinetDisplay();
}

function onMemberObjectDragEnd(obj) {
    if (!obj || !obj.properties || !canBeCabinetMember(obj.properties.get('type'))) return false;
    var coords = obj.geometry.getCoordinates();
    var cabinet = findCabinetAtCoords(coords, obj);
    var currentCabId = getObjectCabinetId(obj);

    if (cabinet) {
        var cabUid = getObjectUniqueId(cabinet);
        if (currentCabId !== cabUid) {
            return assignObjectToCabinet(obj, cabUid, { silent: true });
        }
        moveObjectToCoords(obj, cabinet.geometry.getCoordinates());
        if (typeof updateConnectedCables === 'function') updateConnectedCables(obj);
        return true;
    }

    if (currentCabId) {
        var homeCab = getCabinetByUid(currentCabId);
        if (homeCab && homeCab.geometry) {
            var homeCoords = homeCab.geometry.getCoordinates();
            var nearHome = typeof coordsWithinGroupMergeDistance === 'function'
                ? coordsWithinGroupMergeDistance(coords, homeCoords)
                : groupKey(coords) === groupKey(homeCoords);
            if (!nearHome) {
                clearObjectCabinetId(obj);
                if (typeof updateConnectedCables === 'function') updateConnectedCables(obj);
                updateCabinetDisplay();
                if (typeof updateStats === 'function') updateStats();
                if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(obj);
                else if (typeof saveData === 'function') saveData({ object: obj, syncImmediate: true });
                return true;
            }
            moveObjectToCoords(obj, homeCoords);
            if (typeof updateConnectedCables === 'function') updateConnectedCables(obj);
        }
    }
    return false;
}

function buildCabinetStatsHtml(members) {
    var counts = summarizeCabinetMembers(members);
    var keys = Object.keys(counts);
    if (!keys.length) return '<p class="object-card-hint">Пока пусто — добавьте оборудование координатами ящика или через панель «Объекты».</p>';
    var html = '<div class="cabinet-stats-chips">';
    keys.forEach(function(type) {
        html += '<span class="cabinet-stats-chip cabinet-stats-chip--' + getCabinetMemberBadgeTone(type) + '">';
        html += escapeHtml(getCabinetMemberTypeLabel(type)) + ': ' + counts[type];
        html += '</span>';
    });
    html += '</div>';
    return html;
}

function buildCabinetCardContent(cabinet, isEditMode) {
    var name = (cabinet.properties.get('name') || '').trim();
    var comment = cabinet.properties.get('comment') || '';
    var manufacturer = (cabinet.properties.get('manufacturer') || '').trim();
    var model = (cabinet.properties.get('model') || '').trim();
    var cabinetMount = (cabinet.properties.get('cabinetMount') || '').trim();
    var cabinetHeight = parseCabinetDimensionValue(cabinet.properties.get('cabinetHeight'));
    var cabinetWidth = parseCabinetDimensionValue(cabinet.properties.get('cabinetWidth'));
    var cabinetUnits = parseCabinetDimensionValue(cabinet.properties.get('cabinetUnits'));
    var address = (cabinet.properties.get('address') || '').trim();
    var inventoryNumber = (cabinet.properties.get('inventoryNumber') || '').trim();
    var serialNumber = (cabinet.properties.get('serialNumber') || '').trim();
    var uid = getObjectUniqueId(cabinet);
    var members = getCabinetMembersForDisplay(uid);
    var coords = typeof getObjectMapCoordinates === 'function' ? getObjectMapCoordinates(cabinet) : null;
    var html = '<div class="cabinet-card">';

    html += '<section class="cabinet-card-hero object-card-section">';
    html += '<div class="cabinet-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="cabinet-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('cabinet', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="cabinet-card-hero-text">';
    html += '<h3 class="cabinet-card-title">' + escapeHtml(name || 'Ящик') + '</h3>';
    html += '<p class="cabinet-card-subtitle">' + members.length + ' ' + (members.length === 1 ? 'устройство' : (members.length >= 2 && members.length <= 4 ? 'устройства' : 'устройств')) + ' внутри</p>';
    var dimSummary = formatCabinetDimensionsSummary(cabinet);
    if (dimSummary) {
        html += '<p class="cabinet-card-dims">' + escapeHtml(dimSummary) + '</p>';
    }
    if (coords) {
        html += '<p class="cabinet-card-coords">' + coords[0].toFixed(6) + ', ' + coords[1].toFixed(6) + '</p>';
    }
    html += '</div></div>';
    html += '<p class="object-card-hint">Шкаф / бокс на карте. Всё оборудование внутри имеет те же координаты, что и ящик.</p>';
    html += '</section>';

    html += '<section class="object-card-section cabinet-card-stats">';
    html += '<div class="object-card-section-head"><h4 class="object-card-section-title">Состав</h4></div>';
    html += buildCabinetStatsHtml(members);
    html += '</section>';

    html += '<section class="object-card-section cabinet-card-params">';
    html += '<div class="object-card-section-head"><h4 class="object-card-section-title">Документация</h4></div>';
    if (isEditMode) {
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetName">Название</label>';
        html += '<input type="text" id="editCabinetName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Шкаф ул. Ленина 5">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetManufacturerTrigger">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="cabinet" data-type="manufacturer" data-value-id="editCabinetManufacturer">';
        html += '<button type="button" class="device-combobox-trigger" id="editCabinetManufacturerTrigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button>';
        html += '<input type="hidden" id="editCabinetManufacturer" value="' + escapeHtml(manufacturer) + '">';
        html += '<div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div>';
        html += '</div></div>';
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetModelTrigger">Модель</label>';
        html += '<div class="device-combobox" data-catalog="cabinet" data-type="model" data-value-id="editCabinetModel" data-manufacturer-id="editCabinetManufacturer">';
        html += '<button type="button" class="device-combobox-trigger" id="editCabinetModelTrigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button>';
        html += '<input type="hidden" id="editCabinetModel" value="' + escapeHtml(model) + '">';
        html += '<div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div>';
        html += '</div></div>';
        html += buildCabinetDimensionsFieldsHtml('editCabinet', {
            height: cabinetHeight,
            width: cabinetWidth,
            units: cabinetUnits
        });
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetMount">Монтаж</label>';
        html += '<select id="editCabinetMount" class="form-select">' + getCabinetMountSelectOptionsHtml(cabinetMount) + '</select>';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetAddress">Адрес установки</label>';
        html += '<input type="text" id="editCabinetAddress" class="form-input" value="' + escapeHtml(address) + '" placeholder="Улица, дом, ориентир">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetInventoryNumber">Инвентарный номер</label>';
        html += '<input type="text" id="editCabinetInventoryNumber" class="form-input" value="' + escapeHtml(inventoryNumber) + '" placeholder="Необязательно">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label class="object-card-label" for="editCabinetSerialNumber">Серийный номер</label>';
        html += '<input type="text" id="editCabinetSerialNumber" class="form-input" value="' + escapeHtml(serialNumber) + '" placeholder="Необязательно">';
        html += '</div>';
        html += '<div class="form-group">';
        html += '<label class="object-card-label" for="editCabinetComment">Комментарий</label>';
        html += '<textarea id="editCabinetComment" class="form-input" rows="3" placeholder="Ключ, доступ, примечания">' + escapeHtml(comment) + '</textarea>';
        html += '</div>';
    } else {
        html += '<dl class="cabinet-meta-list">';
        html += '<div class="cabinet-meta-row"><dt>Название</dt><dd>' + escapeHtml(name || '—') + '</dd></div>';
        if (manufacturer || model) {
            html += '<div class="cabinet-meta-row"><dt>Марка / модель</dt><dd>' + escapeHtml([manufacturer, model].filter(Boolean).join(' · ') || '—') + '</dd></div>';
        }
        if (cabinetHeight || cabinetWidth || cabinetUnits) {
            html += '<div class="cabinet-meta-row"><dt>Габариты</dt><dd>';
            var dimParts = [];
            if (cabinetWidth) dimParts.push('шир. ' + cabinetWidth + ' мм');
            if (cabinetHeight) dimParts.push('выс. ' + cabinetHeight + ' мм');
            if (cabinetUnits) dimParts.push(cabinetUnits + ' U');
            html += escapeHtml(dimParts.join(', '));
            html += '</dd></div>';
        }
        if (cabinetMount) html += '<div class="cabinet-meta-row"><dt>Монтаж</dt><dd>' + escapeHtml(getCabinetMountLabel(cabinetMount)) + '</dd></div>';
        if (address) html += '<div class="cabinet-meta-row"><dt>Адрес</dt><dd>' + escapeHtml(address) + '</dd></div>';
        if (inventoryNumber) html += '<div class="cabinet-meta-row"><dt>Инв. №</dt><dd>' + escapeHtml(inventoryNumber) + '</dd></div>';
        if (serialNumber) html += '<div class="cabinet-meta-row"><dt>Серийный №</dt><dd>' + escapeHtml(serialNumber) + '</dd></div>';
        if (comment) html += '<div class="cabinet-meta-row"><dt>Комментарий</dt><dd>' + escapeHtml(comment) + '</dd></div>';
        if (!manufacturer && !model && !cabinetMount && !cabinetHeight && !cabinetWidth && !cabinetUnits && !address && !inventoryNumber && !serialNumber && !comment) {
            html += '<p class="object-card-hint">Характеристики не заполнены — укажите в режиме редактирования.</p>';
        }
        html += '</dl>';
    }
    html += typeof buildObjectCoordsSectionHtml === 'function' ? buildObjectCoordsSectionHtml(cabinet) : '';
    if (typeof buildObjectGallerySectionHtml === 'function') {
        html += buildObjectGallerySectionHtml(cabinet, isEditMode);
    }
    html += '</section>';

    if (isEditMode) {
        html += buildCabinetMemberAddSectionHtml(cabinet, isEditMode);
    }

    html += '<section class="object-card-section cabinet-card-members">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Состав</h4>';
    html += '<span class="object-card-badge object-card-badge--inline">' + members.length + '</span>';
    html += '</div>';

    if (isEditMode && currentCableTool) {
        html += '<p class="object-card-hint">Кликните «Кабель» у кросса или муфты — или выберите ящик на карте.</p>';
    }

    if (!members.length) {
        html += '<p class="object-card-hint">Пока пусто.</p>';
    } else {
        html += '<div class="cabinet-members-list">';
        members.forEach(function(member, idx) {
            var type = member.properties.get('type');
            var cableCount = countCablesForObject(member);
            var tone = getCabinetMemberBadgeTone(type);
            html += '<div class="cabinet-member-row cabinet-member-item" data-member-index="' + idx + '">';
            html += '<div class="cabinet-member-row-main">';
            if (window.MapIcons) {
                html += '<span class="cabinet-member-icon" aria-hidden="true">' + MapIcons.buildIconSvg(type, { variant: 'normal', nodeKind: member.properties.get('nodeKind') }) + '</span>';
            }
            html += '<div class="cabinet-member-text">';
            html += '<span class="cabinet-member-badge cabinet-member-badge--' + tone + '">' + escapeHtml(getCabinetMemberTypeLabel(type)) + '</span>';
            html += '<span class="cabinet-member-name">' + escapeHtml((member.properties.get('name') || '').trim() || 'Без имени') + '</span>';
            html += '<span class="cabinet-member-cables">' + cableCount + ' каб.</span>';
            html += '</div></div>';
            if (isEditMode && currentCableTool && isCabinetCableEndpointType(type)) {
                html += '<button type="button" class="btn-secondary btn-cabinet-member-cable" data-member-uid="' + escapeHtml(getObjectUniqueId(member)) + '" title="Прокладка кабеля">Кабель</button>';
            } else if (isEditMode) {
                html += '<button type="button" class="group-item-move btn-cabinet-member-remove" data-member-uid="' + escapeHtml(getObjectUniqueId(member)) + '" title="Вынести">Вынести</button>';
            }
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</section>';

    if (isEditMode) {
        html += '<div class="object-actions-section cabinet-card-actions">';
        html += '<button type="button" id="saveChangesBtn" class="btn-primary node-card-save-btn">Сохранить</button>';
        html += '<button type="button" id="duplicateCurrentObject" class="btn-secondary">Дублировать</button>';
        html += '<button type="button" id="deleteCurrentObject" class="btn-danger">Удалить</button>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function bindCabinetCardControls(root, cabinet) {
    if (!root || !cabinet) return;

    var typeSel = root.querySelector('#cabinetCreateType');
    var fieldsPanel = root.querySelector('#cabinetCreateFields');
    if (typeSel && fieldsPanel) {
        typeSel.addEventListener('change', function() {
            fieldsPanel.innerHTML = buildCabinetCreateFieldsHtml(typeSel.value);
            if (typeof initDeviceComboboxes === 'function') initDeviceComboboxes(fieldsPanel);
        });
        if (typeof initDeviceComboboxes === 'function') initDeviceComboboxes(fieldsPanel);
    }

    var createBtn = root.querySelector('#cabinetCreateBtn');
    if (createBtn) {
        createBtn.addEventListener('click', function() {
            var type = typeSel ? typeSel.value : 'cross';
            var nameInp = root.querySelector('#cabinetCreateName');
            var name = nameInp ? nameInp.value.trim() : '';
            var opts = collectCabinetCreateOptions(root, type);
            if (createCabinetMemberObject(cabinet, type, name, opts)) {
                showCabinetInfo(cabinet);
            }
        });
    }

    root.querySelectorAll('.btn-cabinet-pick-add').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var member = getMapObjectByUid(btn.getAttribute('data-member-uid'));
            if (member && assignObjectToCabinet(member, getObjectUniqueId(cabinet))) {
                showCabinetInfo(cabinet);
            }
        });
    });
    root.querySelectorAll('.cabinet-member-item').forEach(function(row) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function(e) {
            if (e.target && e.target.closest('.btn-cabinet-member-remove')) return;
            if (e.target && e.target.closest('.btn-cabinet-member-cable')) return;
            var idx = parseInt(row.getAttribute('data-member-index'), 10);
            var members = getCabinetMembersForDisplay(getObjectUniqueId(cabinet));
            if (!members[idx]) return;
            var member = members[idx];
            if (currentCableTool && isEditMode && isCabinetCableEndpointType(member.properties.get('type'))) {
                processCabinetMemberCableAction(member);
                return;
            }
            showObjectInfo(member);
        });
    });
    root.querySelectorAll('.btn-cabinet-member-cable').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var member = getMapObjectByUid(btn.getAttribute('data-member-uid'));
            if (member) processCabinetMemberCableAction(member);
        });
    });
    root.querySelectorAll('.btn-cabinet-member-remove').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var member = getMapObjectByUid(btn.getAttribute('data-member-uid'));
            if (member && removeObjectFromCabinet(member, true)) showCabinetInfo(cabinet);
        });
    });
}

function showCabinetInfo(cabinet) {
    if (!cabinet || !cabinet.properties || cabinet.properties.get('type') !== 'cabinet') return;
    applyModalEditModeForObject(cabinet, function() {
        currentModalObject = cabinet;
        var name = (cabinet.properties.get('name') || '').trim();
        document.getElementById('modalTitle').textContent = name ? ('Ящик: ' + name) : 'Ящик';
        if (typeof updateInfoModalChrome === 'function') updateInfoModalChrome('cabinet', name);

        var modalInfoEl = document.getElementById('modalInfo');
        modalInfoEl.innerHTML = buildCabinetCardContent(cabinet, modalIsEditMode());
        bindCabinetCardControls(modalInfoEl, cabinet);
        if (typeof bindObjectGalleryModal === 'function') bindObjectGalleryModal(modalInfoEl, cabinet);
        if (typeof initDeviceComboboxes === 'function') initDeviceComboboxes(modalInfoEl);

        resetInfoModalFiberLayout();
        var modal = document.getElementById('infoModal');
        setupEditAndDeleteListeners();
        attachObjectCoordsSectionHandlers(modalInfoEl);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('modal--centered');
            modal.classList.remove('fiber-management-modal-open', 'fiber-management-modal-open--edit', 'fiber-management-modal-open--view');
            var modalContent = modal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.remove('fiber-management-modal');
            updateModalLockBanner(getObjectUniqueId(cabinet));
            applyObjectLocksToMapDraggable();
            if (typeof window.initPanelPlexusCanvases === 'function') {
                requestAnimationFrame(function () { window.initPanelPlexusCanvases(modal); });
            }
        }
    });
}

function flushCabinetFieldsIfChanged() {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'cabinet') return;
    var nameEl = document.getElementById('editCabinetName');
    var commentEl = document.getElementById('editCabinetComment');
    var mfrEl = document.getElementById('editCabinetManufacturer');
    var modelEl = document.getElementById('editCabinetModel');
    var mountEl = document.getElementById('editCabinetMount');
    var heightEl = document.getElementById('editCabinetHeight');
    var widthEl = document.getElementById('editCabinetWidth');
    var unitsEl = document.getElementById('editCabinetUnits');
    var addressEl = document.getElementById('editCabinetAddress');
    var invEl = document.getElementById('editCabinetInventoryNumber');
    var serialEl = document.getElementById('editCabinetSerialNumber');
    if (nameEl) {
        var n = nameEl.value.trim();
        currentModalObject.properties.set('name', n);
        currentModalObject.properties.set('balloonContent', n ? ('Ящик: ' + n) : 'Ящик');
        updateCabinetLabel(currentModalObject);
    }
    if (mfrEl) currentModalObject.properties.set('manufacturer', mfrEl.value.trim());
    if (modelEl) currentModalObject.properties.set('model', modelEl.value.trim());
    if (mountEl) currentModalObject.properties.set('cabinetMount', mountEl.value.trim());
    if (heightEl) currentModalObject.properties.set('cabinetHeight', parseCabinetDimensionValue(heightEl.value));
    if (widthEl) currentModalObject.properties.set('cabinetWidth', parseCabinetDimensionValue(widthEl.value));
    if (unitsEl) currentModalObject.properties.set('cabinetUnits', parseCabinetDimensionValue(unitsEl.value));
    if (addressEl) currentModalObject.properties.set('address', addressEl.value.trim());
    if (invEl) currentModalObject.properties.set('inventoryNumber', invEl.value.trim());
    if (serialEl) currentModalObject.properties.set('serialNumber', serialEl.value.trim());
    if (commentEl) currentModalObject.properties.set('comment', commentEl.value.trim());
}
