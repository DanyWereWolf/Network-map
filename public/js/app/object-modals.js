/**
 * Карточки объектов и кабелей, модальное окно infoModal.
 */
function buildOltPortTypeOptionsHtml(currentKind, kindOpts) {
    kindOpts = kindOpts || (typeof getPonPortKindOptions === 'function' ? getPonPortKindOptions() : ['GPON']);
    var cur = String(currentKind || '').trim();
    var opts = kindOpts.slice();
    if (cur && opts.indexOf(cur) === -1) opts.unshift(cur);
    var html = '';
    opts.forEach(function(ko) {
        html += '<option value="' + escapeHtml(ko) + '"' + (ko === cur ? ' selected' : '') + '>' + escapeHtml(ko) + '</option>';
    });
    return html;
}

function buildNodeSwitchPortKindOptionsHtml(currentKind, kindOpts) {
    kindOpts = kindOpts || (typeof getSwitchPortKindOptions === 'function' ? getSwitchPortKindOptions() : []);
    var cur = String(currentKind || '').trim();
    var canon = typeof canonicalizeSwitchPortKindLabel === 'function' ? canonicalizeSwitchPortKindLabel(cur) : cur;
    var opts = kindOpts.slice();
    if (cur && opts.indexOf(cur) === -1 && opts.indexOf(canon) === -1) {
        opts.unshift(cur);
    }
    var html = '';
    opts.forEach(function(ko) {
        html += '<option value="' + escapeHtml(ko) + '"' + (ko === cur || ko === canon ? ' selected' : '') + '>' + escapeHtml(ko) + '</option>';
    });
    return html;
}

function buildEquipmentIpAddressEditFieldHtml(id, value, labelClass) {
    var lc = labelClass || 'object-card-label';
    return '<div class="form-group"><label class="' + lc + '" for="' + escapeHtml(id) + '">IP-адрес</label>' +
        '<input type="text" id="' + escapeHtml(id) + '" class="form-input equipment-ip-input" value="' + escapeHtml(value || '') + '" placeholder="Например: 192.168.1.10" inputmode="decimal" autocomplete="off"></div>';
}

function buildEquipmentIpAddressViewLineHtml(ip, className) {
    var v = (ip || '').trim();
    if (!v) return '';
    return '<div class="' + (className || 'object-card-meta-line') + '">IP: ' + escapeHtml(v) + '</div>';
}

function buildNodeCardContent(obj, isEditMode, name) {
    var html = '';
    var nodeKind = obj.properties.get('nodeKind') || 'network';
    var comment = obj.properties.get('comment') || '';
    var nodeKindLabel = nodeKind === 'aggregation' ? 'Узел агрегации' : 'Узел сети';
    var attachedList = getNodeAttachedSwitches(obj);
    var swSummary = getNodeSwitchesSummary(obj);
    var kindOptsNodeSw = typeof getSwitchPortKindOptions === 'function'
        ? getSwitchPortKindOptions()
        : ['RJ45 1000Base-T (Gigabit, порт G)', 'RJ45 PoE', 'SFP (mini-GBIC, 1G)', 'SFP+ (10G)', 'Комбо RJ45/SFP', 'Консоль', 'Uplink/stack'];
    var defaultPortKind = typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)';
    var nodeUniqueId = getObjectUniqueId(obj);
    var connectedFibers = getNodeConnectedFibers(nodeUniqueId);
    var kindMod = nodeKind === 'aggregation' ? 'node-card--aggregation' : 'node-card--network';

    html += '<div class="node-card ' + kindMod + '">';

    html += '<section class="object-card-section node-card-hero">';
    html += '<div class="node-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="node-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('node', { variant: 'normal', nodeKind: nodeKind }) + '</div>';
    }
    html += '<div class="node-card-hero-text">';
    if (!isEditMode) {
        html += '<div class="node-card-view-name">' + escapeHtml(name || 'Без названия') + '</div>';
        html += '<div class="node-card-view-meta"><span class="node-kind-pill node-kind-pill--' + (nodeKind === 'aggregation' ? 'aggregation' : 'network') + '">' + escapeHtml(nodeKindLabel) + '</span></div>';
        if (comment) {
            html += '<div class="node-card-comment">' + escapeHtml(comment) + '</div>';
        }
    } else {
        html += '<div class="node-card-view-name">' + escapeHtml(name || 'Новый узел') + '</div>';
        html += '<p class="object-card-hint node-card-hero-hint">Коммутаторы внутри узла, оптика с кросса на порты <strong>SFP</strong>, медь — на RJ45.</p>';
    }
    html += '</div></div>';
    html += '<dl class="node-card-stats">';
    html += '<div class="node-card-stat"><dt>Жил с кросса</dt><dd>' + connectedFibers.length + '</dd></div>';
    html += '<div class="node-card-stat"><dt>Коммутаторов</dt><dd>' + attachedList.length + '</dd></div>';
    html += '<div class="node-card-stat"><dt>Порты занято</dt><dd>' + (swSummary.swCount > 0 ? (swSummary.busyPorts + ' / ' + swSummary.totalPorts) : '—') + '</dd></div>';
    html += '</dl></section>';

    html += buildObjectCoordsSectionHtml(obj);

    if (isEditMode) {
        html += '<section class="object-card-section object-card-section--params">';
        html += '<h4 class="object-card-section-title">Параметры узла</h4>';
        html += '<div class="node-card-fields-grid">';
        html += '<div class="form-group"><label for="editNodeName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editNodeName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название узла">';
        html += '</div>';
        html += '<div class="form-group"><label for="editNodeKind" class="object-card-label">Тип на карте</label>';
        html += '<select id="editNodeKind" class="form-select">';
        html += '<option value="network"' + (nodeKind === 'network' ? ' selected' : '') + '>Сеть (зелёный)</option>';
        html += '<option value="aggregation"' + (nodeKind === 'aggregation' ? ' selected' : '') + '>Агрегация (красный)</option>';
        html += '</select></div></div>';
        html += '<div class="form-group" style="margin-top:12px;margin-bottom:0;"><label for="editNodeComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editNodeComment" class="form-input" rows="2" placeholder="Необязательно">' + escapeHtml(comment) + '</textarea></div>';
        html += '</section>';
    }

    html += '<section class="object-card-section object-card-section--fibers">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Оптика</h4>';
    html += '<span class="object-card-badge object-card-badge--fiber">' + connectedFibers.length + '</span>';
    html += '</div>';
    if (connectedFibers.length > 0) {
        html += '<div class="node-fiber-list">';
        connectedFibers.forEach(function(conn) {
            html += '<div class="node-fiber-item">';
            html += '<div class="node-fiber-item-main">';
            if (conn.source === 'splitter') {
                html += '<span class="node-fiber-num">Сплиттер «' + escapeHtml(conn.splitterName || 'Сплиттер') + '» · вых. ' + conn.outputNumber + '</span>';
                if (conn.switchPort != null) {
                    html += '<span class="node-fiber-label">SFP ' + escapeHtml(String(conn.switchPort)) + '</span>';
                }
                if (conn.cableId && conn.fiberNumber != null) {
                    html += '<span class="node-fiber-label">вх. ж' + conn.fiberNumber + '</span>';
                }
            } else {
                html += '<span class="node-fiber-num">Жила ' + conn.fiberNumber + '</span>';
                if (conn.switchPort != null) {
                    html += '<span class="node-fiber-label">SFP ' + escapeHtml(String(conn.switchPort)) + '</span>';
                }
            }
            html += '<span class="node-fiber-cross">' + escapeHtml(conn.crossName) + '</span>';
            if (conn.fiberLabel) {
                html += '<span class="node-fiber-label">' + escapeHtml(conn.fiberLabel) + '</span>';
            }
            html += '</div>';
            if (conn.source === 'splitter') {
                html += '<button type="button" class="btn-trace-from-node-splitter btn-node-trace" data-splitter-id="' + escapeHtml(conn.splitterId) + '" data-output-index="' + conn.outputIndex + '">Трассировка</button>';
            } else {
                html += '<button type="button" class="btn-trace-from-node btn-node-trace" data-cross-id="' + escapeHtml(conn.crossUniqueId) + '" data-cable-id="' + escapeHtml(conn.cableId) + '" data-fiber-number="' + conn.fiberNumber + '">Трассировка</button>';
            }
            html += '</div>';
        });
        html += '</div>';
    } else {
        html += '<div class="object-card-callout object-card-callout--warn"><p>Оптических подключений нет — подключите жилу с кросса (SFP) или выход сплиттера на узел.</p></div>';
    }
    html += '</section>';

    html += '<section class="object-card-section object-card-section--switches">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Коммутаторы</h4>';
    if (swSummary.swCount > 0) {
        html += '<span class="object-card-badge object-card-badge--switch" title="Занято портов">' + swSummary.busyPorts + '/' + swSummary.totalPorts + '</span>';
    }
    html += '</div>';

    if (isEditMode) {
        var addOpen = attachedList.length === 0 ? ' open' : '';
        html += '<details class="node-card-add-switch"' + addOpen + '>';
        html += '<summary class="node-card-add-switch-summary">Добавить коммутатор</summary>';
        html += '<div class="node-card-add-switch-body">';
        html += '<div class="node-card-fields-grid node-card-fields-grid--add">';
        html += '<div class="form-group"><label for="newNodeSwitchName" class="object-card-label">Подпись</label>';
        html += '<input type="text" id="newNodeSwitchName" class="form-input" placeholder="Необязательно"></div>';
        html += '<div class="form-group"><label for="newNodeSwitchPortCount" class="object-card-label">Портов</label>';
        html += '<input type="number" id="newNodeSwitchPortCount" class="form-input" min="1" max="96" value="24"></div>';
        html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="switch" data-type="manufacturer" data-value-id="newNodeSwitchManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">Выберите</button><input type="hidden" id="newNodeSwitchManufacturer" value=""><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label class="object-card-label">Модель</label>';
        html += '<div class="device-combobox" data-catalog="switch" data-type="model" data-value-id="newNodeSwitchModel" data-manufacturer-id="newNodeSwitchManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">Выберите</button><input type="hidden" id="newNodeSwitchModel" value=""><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group node-card-add-portkind"><label for="newNodeSwitchPortKind" class="object-card-label">Тип порта по умолчанию</label>';
        html += '<select id="newNodeSwitchPortKind" class="form-select">';
        kindOptsNodeSw.forEach(function(kk) {
            html += '<option value="' + escapeHtml(kk) + '"' + (kk === defaultPortKind ? ' selected' : '') + '>' + escapeHtml(kk) + '</option>';
        });
        html += '</select></div></div>';
        html += '<p class="object-card-hint">Число портов подставится из справочника при выборе модели.</p>';
        html += '<button type="button" id="btnAddNodeSwitch" class="btn-primary node-card-add-btn">Добавить</button>';
        html += '</div></details>';
    }

    if (attachedList.length === 0) {
        html += '<p class="object-card-hint">Нет коммутаторов — добавьте для медных кабелей и выбора порта при прокладке.</p>';
    }

    attachedList.forEach(function(swRow, six) {
        var usageN = swRow.copperPortUsage || {};
        var pts = swRow.switchPortTypes || [];
        var swMfr = (swRow.manufacturer || '').trim();
        var swMod = (swRow.model || '').trim();
        var swComment = (swRow.comment || '').trim();
        var swIp = (swRow.ipAddress || '').trim();
        var uidEsc = escapeHtml(swRow.uniqueId);
        var portStats = getAttachedSwitchPortStats(swRow);
        var swTitle = swRow.name || ('Коммутатор ' + (six + 1));
        var deviceLine = [swMfr, swMod].filter(Boolean).join(' · ');
        var swOpen = attachedList.length === 1 || portStats.total <= 8 ? ' open' : '';
        var utilPct = portStats.total > 0 ? Math.round((portStats.busy / portStats.total) * 100) : 0;
        html += '<details class="node-card-switch-item"' + swOpen + '>';
        html += '<summary class="node-card-switch-summary">';
        html += '<span class="node-card-switch-title">' + escapeHtml(swTitle) + '</span>';
        if (deviceLine) {
            html += '<span class="node-card-switch-device">' + escapeHtml(deviceLine) + '</span>';
        }
        html += '<span class="node-switch-port-meter" title="Занято ' + portStats.busy + ' из ' + portStats.total + ' портов" aria-hidden="true"><span class="node-switch-port-meter-fill" style="width:' + utilPct + '%"></span></span>';
        html += '<span class="object-card-badge object-card-badge--inline object-card-badge--switch">' + portStats.busy + '/' + portStats.total + '</span>';
        html += '</summary>';
        html += '<div class="node-card-switch-body">';
        if (isEditMode) {
            html += '<div class="node-card-switch-toolbar">';
            html += '<div class="form-group node-card-switch-label-field"><label class="object-card-label">Подпись</label>';
            html += '<input type="text" class="form-input edit-node-switch-name" data-switch-id="' + uidEsc + '" value="' + escapeHtml(swRow.name || '') + '" placeholder="Коммутатор ' + (six + 1) + '">';
            html += '</div>';
            html += '<div class="node-card-switch-delete-wrap"><button type="button" class="btn-remove-node-switch btn-danger" data-switch-id="' + uidEsc + '">Удалить</button></div>';
            html += '</div>';
            html += '<div class="node-card-fields-grid">';
            html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
            html += '<div class="device-combobox" data-catalog="switch" data-type="manufacturer" data-value-id="editNodeSwMfr_' + uidEsc + '"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (swMfr ? escapeHtml(swMfr) : 'Выберите') + '</button><input type="hidden" id="editNodeSwMfr_' + uidEsc + '" value="' + escapeHtml(swMfr) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group"><label class="object-card-label">Модель</label>';
            html += '<div class="device-combobox" data-catalog="switch" data-type="model" data-value-id="editNodeSwMod_' + uidEsc + '" data-manufacturer-id="editNodeSwMfr_' + uidEsc + '"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (swMod ? escapeHtml(swMod) : 'Выберите') + '</button><input type="hidden" id="editNodeSwMod_' + uidEsc + '" value="' + escapeHtml(swMod) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '</div>';
            html += '<div class="form-group" style="margin-top:10px;margin-bottom:0;"><label class="object-card-label">IP-адрес</label>';
            html += '<input type="text" class="form-input edit-node-switch-ip" data-switch-id="' + uidEsc + '" value="' + escapeHtml(swIp) + '" placeholder="Необязательно" inputmode="decimal" autocomplete="off"></div>';
            html += '<div class="form-group" style="margin-top:10px;margin-bottom:0;"><label class="object-card-label">Комментарий</label>';
            html += '<textarea class="form-input edit-node-switch-comment" data-switch-id="' + uidEsc + '" rows="2" placeholder="Необязательно">' + escapeHtml(swComment) + '</textarea></div>';
        } else if (deviceLine) {
            html += '<div class="node-card-switch-device-view">' + escapeHtml(deviceLine) + '</div>';
        }
        if (!isEditMode && swIp) {
            html += '<div class="node-card-switch-ip-view">IP: ' + escapeHtml(swIp) + '</div>';
        }
        if (!isEditMode && swComment) {
            html += '<div class="node-card-switch-comment">' + escapeHtml(swComment) + '</div>';
        }
        html += '<div class="node-ports-table-wrap"><table class="node-ports-table"><thead><tr><th>#</th><th>Тип</th><th>Подпись</th><th>Состояние</th>';
        html += '</tr></thead><tbody>';
        var portLabelsSw = typeof getAttachedSwitchPortLabels === 'function' ? getAttachedSwitchPortLabels(swRow) : {};
        for (var swi = 0; swi < pts.length; swi++) {
            var pnumSw = swi + 1;
            var fiberUsageN = swRow.fiberPortUsage || {};
            var cableUidSw = usageN[String(pnumSw)];
            var fiberKeySw = fiberUsageN[String(pnumSw)];
            var cblSw = cableUidSw ? objects.find(function(c) { return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableUidSw; }) : null;
            var cnameSw = cblSw ? (cblSw.properties.get('cableName') || getCableDescription(cblSw.properties.get('cableType'))) : '';
            var isCopperPortRow = typeof isSwitchPortCopperCapable === 'function'
                ? isSwitchPortCopperCapable(pts[swi] || '')
                : !(isSwitchPortSfpFiberType(pts[swi] || ''));
            var manualBusy = typeof isAttachedSwitchPortManuallyBusy === 'function' && isAttachedSwitchPortManuallyBusy(swRow, pnumSw);
            var rowBusy = !!(cableUidSw || fiberKeySw || manualBusy);
            var portLabelSw = (portLabelsSw[String(pnumSw)] || '').trim();
            html += '<tr class="' + (rowBusy ? 'node-port-row--busy' : 'node-port-row--free') + '">';
            html += '<td>' + pnumSw + '</td><td>';
            if (isEditMode) {
                html += '<select class="edit-node-switch-port-kind form-select form-select-compact" data-switch-id="' + escapeHtml(swRow.uniqueId) + '" data-idx="' + swi + '">';
                html += buildNodeSwitchPortKindOptionsHtml(pts[swi], kindOptsNodeSw);
                html += '</select>';
            } else {
                html += escapeHtml(pts[swi] || '—');
            }
            html += '</td>';
            if (isEditMode) {
                html += '<td><input type="text" class="form-input form-input-compact edit-node-switch-port-label" data-switch-id="' + uidEsc + '" data-port="' + pnumSw + '" value="' + escapeHtml(portLabelSw) + '" placeholder="Абонент" title="Подпись порта"></td>';
            } else {
                html += '<td class="node-port-label">' + (portLabelSw ? escapeHtml(portLabelSw) : '—') + '</td>';
            }
            html += '<td class="node-port-state">';
            if (cnameSw) {
                html += '<span class="node-port-state-connected">Медь: ' + escapeHtml(cnameSw) + '</span>';
            } else if (fiberKeySw) {
                html += '<span class="node-port-state-connected">ВОЛС</span>';
            } else if (isEditMode) {
                html += '<div class="node-port-state-controls">';
                html += '<label class="node-port-busy-toggle" title="Порт используется без кабеля на карте">';
                html += '<input type="checkbox" class="edit-node-switch-port-busy" data-switch-id="' + uidEsc + '" data-port="' + pnumSw + '"' + (manualBusy ? ' checked' : '') + '>';
                html += '<span>Занят</span></label>';
                if (isCopperPortRow && !manualBusy) {
                    html += '<button type="button" class="btn-secondary btn-copper-connect-from-node-port btn-compact" data-switch-id="' + escapeHtml(swRow.uniqueId) + '" data-copper-port="' + pnumSw + '">Подключить</button>';
                }
                html += '</div>';
            } else if (manualBusy) {
                html += '<span class="node-port-state-manual">Используется</span>';
            } else {
                html += '<span class="node-port-state-free">Свободен</span>';
            }
            html += '</td>';
            html += '</tr>';
        }
        html += '</tbody></table></div></div></details>';
    });

    html += '</section>';

    html += buildObjectGallerySectionHtml(obj, isEditMode);

    if (isEditMode) {
        html += buildNodeCardActionsHtml();
    }
    html += '</div>';
    return html;
}

function buildObjectCardActionsHtml(className) {
    className = className || 'node-card-actions';
    var saveSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
    var dupSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    return '<div class="' + className + ' object-actions-section">' +
        '<button type="button" id="saveChangesBtn" class="btn-primary node-card-save-btn">' + saveSvg + ' Сохранить</button>' +
        '<button type="button" id="duplicateCurrentObject" class="btn-secondary">' + dupSvg + ' Дублировать</button>' +
        '<button type="button" id="deleteCurrentObject" class="btn-danger">' + delSvg + ' Удалить</button>' +
        '</div>';
}

function buildNodeCardActionsHtml() {
    return buildObjectCardActionsHtml('node-card-actions');
}

function findAttachedSwitchOnNode(node, switchId) {
    if (!switchId) return null;
    var arr = getNodeAttachedSwitches(node);
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].uniqueId === switchId) return arr[i];
    }
    return null;
}

function collectFreeSfpPortOptionsOnNode(nodeObj) {
    var out = [];
    if (!nodeObj || !nodeObj.properties || nodeObj.properties.get('type') !== 'node') return out;
    getNodeAttachedSwitches(nodeObj).forEach(function(sw) {
        if (!sw || !sw.uniqueId) return;
        var types = sw.switchPortTypes || [];
        var fus = sw.fiberPortUsage || {};
        var swLabel = (sw.name || '').trim() || 'Коммутатор';
        for (var pi = 0; pi < types.length; pi++) {
            var portNum = pi + 1;
            if (!isSwitchPortSfpFiberType(types[pi])) continue;
            if (fus[String(portNum)]) continue;
            var cu = sw.copperPortUsage || {};
            if (cu[String(portNum)]) continue;
            if (typeof isAttachedSwitchPortManuallyBusy === 'function' && isAttachedSwitchPortManuallyBusy(sw, portNum)) continue;
            out.push({
                switchId: sw.uniqueId,
                switchLabel: swLabel,
                port: portNum,
                portTypeLabel: types[pi]
            });
        }
    });
    return out;
}

function markNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum, fiberUsageKey) {
    if (!nodeObj || !switchId || portNum == null) return false;
    var arr = getNodeAttachedSwitches(nodeObj).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return false;
    var sw = Object.assign({}, arr[ix]);
    var fu = Object.assign({}, sw.fiberPortUsage || {});
    fu[String(portNum)] = fiberUsageKey;
    sw.fiberPortUsage = fu;
    arr[ix] = sw;
    nodeObj.properties.set('attachedSwitches', arr);
    return true;
}

function clearNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum) {
    if (!nodeObj || !switchId || portNum == null) return false;
    var arr = getNodeAttachedSwitches(nodeObj).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return false;
    var sw = Object.assign({}, arr[ix]);
    var fu = Object.assign({}, sw.fiberPortUsage || {});
    delete fu[String(portNum)];
    sw.fiberPortUsage = fu;
    arr[ix] = sw;
    nodeObj.properties.set('attachedSwitches', arr);
    return true;
}

function resolveSwitchIdForCopperNodeClick(node) {
    var arr = getNodeAttachedSwitches(node);
    if (arr.length === 0) return null;
    if (arr.length === 1) return arr[0].uniqueId;
    var lines = arr.map(function(s, i) { return (i + 1) + ') ' + (s.name || 'Коммутатор'); });
    var r = typeof window.prompt === 'function' ? window.prompt('Выберите коммутатор (введите номер 1–' + arr.length + '):\n' + lines.join('\n'), '1') : '1';
    var n = parseInt(r, 10);
    if (isNaN(n) || n < 1 || n > arr.length) return null;
    return arr[n - 1].uniqueId;
}

/** Переносит manufacturer/model с узла (устаревшее) в attachedSwitches и очищает поля узла. */
function migrateNodeLevelSwitchMetaToAttached() {
    if (!Array.isArray(objects)) return;
    var changed = false;
    objects.forEach(function(node) {
        if (!node || !node.properties || node.properties.get('type') !== 'node') return;
        var mfr = (node.properties.get('manufacturer') || '').trim();
        var mod = (node.properties.get('model') || '').trim();
        if (!mfr && !mod) return;
        var arr = getNodeAttachedSwitches(node).slice();
        if (arr.length === 0) {
            addAttachedSwitchToNode(node, '', 24, typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)', mfr, mod);
        } else {
            var sw = Object.assign({}, arr[0]);
            if (mfr && !(sw.manufacturer || '').trim()) sw.manufacturer = mfr;
            if (mod && !(sw.model || '').trim()) sw.model = mod;
            arr[0] = sw;
            node.properties.set('attachedSwitches', arr);
        }
        node.properties.unset('manufacturer');
        node.properties.unset('model');
        changed = true;
    });
    return changed;
}

function migrateStandaloneSwitchesIntoNodes() {
    if (!Array.isArray(objects) || !myMap) return;
    var switches = objects.filter(function(o) { return o && o.properties && o.properties.get('type') === 'switch'; });
    if (switches.length === 0) return;
    switches.forEach(function(sw) {
        var pid = sw.properties.get('parentNodeId');
        var node = objects.find(function(n) {
            return n && n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === pid;
        });
        if (!node) return;
        var swUid = sw.properties.get('uniqueId') || ('sw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6));
        var arr = getNodeAttachedSwitches(node).slice();
        var swEntry = {
            uniqueId: swUid,
            name: sw.properties.get('name') || '',
            switchPortTypes: Array.isArray(sw.properties.get('switchPortTypes')) && sw.properties.get('switchPortTypes').length
                ? sw.properties.get('switchPortTypes').slice()
                : buildSwitchPortTypesArray(24, typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)'),
            copperPortUsage: Object.assign({}, sw.properties.get('copperPortUsage') || {}),
            fiberPortUsage: Object.assign({}, sw.properties.get('fiberPortUsage') || {}),
            portLabels: Object.assign({}, sw.properties.get('portLabels') || {}),
            manualPortUsage: Object.assign({}, sw.properties.get('manualPortUsage') || {})
        };
        var mMig = (sw.properties.get('manufacturer') || '').trim();
        var moMig = (sw.properties.get('model') || '').trim();
        if (mMig) swEntry.manufacturer = mMig;
        if (moMig) swEntry.model = moMig;
        var cMig = (sw.properties.get('comment') || '').trim();
        if (cMig) swEntry.comment = cMig;
        arr.push(swEntry);
        node.properties.set('attachedSwitches', arr);
        objects.forEach(function(c) {
            if (!c || !c.properties || c.properties.get('type') !== 'cable') return;
            if (c.properties.get('from') === sw) {
                c.properties.set('from', node);
                c.properties.set('copperSwitchFromId', swUid);
            }
            if (c.properties.get('to') === sw) {
                c.properties.set('to', node);
                c.properties.set('copperSwitchToId', swUid);
            }
        });
        try { myMap.geoObjects.remove(sw); } catch (eR) {}
        var lbl = sw.properties.get('label');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (eL) {}
        var idx = objects.indexOf(sw);
        if (idx !== -1) objects.splice(idx, 1);
    });
}

function isCopperCableUsingNodeSwitch(cable, nodeUid, switchId) {
    if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return false;
    if (!isCopperCableType(cable.properties.get('cableType'))) return false;
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    if (from && from.properties && from.properties.get('uniqueId') === nodeUid && cable.properties.get('copperSwitchFromId') === switchId) return true;
    if (to && to.properties && to.properties.get('uniqueId') === nodeUid && cable.properties.get('copperSwitchToId') === switchId) return true;
    return false;
}

function updateAttachedSwitchMeta(node, switchId, field, value) {
    if (!node || !node.properties || node.properties.get('type') !== 'node' || !switchId || !field) return;
    var arr = getNodeAttachedSwitches(node).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return;
    var sw = Object.assign({}, arr[ix]);
    sw[field] = value;
    arr[ix] = sw;
    node.properties.set('attachedSwitches', arr);
}

function mutateAttachedSwitchOnNode(node, switchId, mutator) {
    if (!node || !switchId || typeof mutator !== 'function') return false;
    var arr = getNodeAttachedSwitches(node).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return false;
    var sw = Object.assign({}, arr[ix]);
    mutator(sw);
    arr[ix] = sw;
    node.properties.set('attachedSwitches', arr);
    return true;
}

function setAttachedSwitchPortLabel(node, switchId, portNum, label) {
    return mutateAttachedSwitchOnNode(node, switchId, function(sw) {
        var pl = Object.assign({}, getAttachedSwitchPortLabels(sw));
        var trimmed = String(label || '').trim();
        if (trimmed) pl[String(portNum)] = trimmed;
        else delete pl[String(portNum)];
        sw.portLabels = pl;
    });
}

function setAttachedSwitchPortManualBusy(node, switchId, portNum, busy) {
    return mutateAttachedSwitchOnNode(node, switchId, function(sw) {
        var mu = Object.assign({}, sw.manualPortUsage || {});
        if (busy) mu[String(portNum)] = true;
        else delete mu[String(portNum)];
        sw.manualPortUsage = mu;
    });
}

function addAttachedSwitchToNode(node, name, portCount, defaultKind, manufacturer, model) {
    if (!node || !node.properties || node.properties.get('type') !== 'node') return null;
    var arr = getNodeAttachedSwitches(node).slice();
    var uid = 'sw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
    var nPorts = Math.max(1, parseInt(portCount, 10) || 24);
    var dk = defaultKind || (typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)');
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    var portTypes = typeof resolveSwitchPortTypesForModel === 'function'
        ? resolveSwitchPortTypesForModel(mfr, mod, nPorts, dk)
        : buildSwitchPortTypesArray(nPorts, dk);
    if (!portTypes || !portTypes.length) portTypes = buildSwitchPortTypesArray(nPorts, dk);
    nPorts = portTypes.length;
    var entry = {
        uniqueId: uid,
        name: (name || '').trim(),
        switchPortTypes: portTypes,
        copperPortUsage: {},
        fiberPortUsage: {},
        portLabels: {},
        manualPortUsage: {}
    };
    if (mfr) entry.manufacturer = mfr;
    if (mod) entry.model = mod;
    arr.push(entry);
    node.properties.set('attachedSwitches', arr);
    return uid;
}

function removeAttachedSwitchFromNode(node, switchId) {
    if (!node || !switchId) return false;
    var nodeUid = node.properties.get('uniqueId');
    var used = objects.some(function(c) { return isCopperCableUsingNodeSwitch(c, nodeUid, switchId); });
    if (used) {
        if (typeof showError === 'function') showError('К этому коммутатору подключены медные кабели. Сначала удалите или переназначьте кабели.', 'Нельзя удалить');
        return false;
    }
    var swDel = findAttachedSwitchOnNode(node, switchId);
    if (swDel && swDel.fiberPortUsage && Object.keys(swDel.fiberPortUsage).length) {
        if (typeof showError === 'function') showError('К этому коммутатору с кросса подключены оптические жилы (порты SFP). Сначала отключите их в карточке кросса.', 'Нельзя удалить');
        return false;
    }
    var arr = getNodeAttachedSwitches(node).filter(function(s) { return s.uniqueId !== switchId; });
    node.properties.set('attachedSwitches', arr);
    return true;
}

function isCopperLanEndDeviceType(t) {
    return t === 'camera' || t === 'mediaConverter';
}

function isRadioBridgeCopperEndpointType(t) {
    return t === 'radioBridge';
}

function cameraHasCopperCable(camObj) {
    if (!camObj || !camObj.properties) return false;
    var t = camObj.properties.get('type');
    if (t === 'radioBridge') {
        return typeof isRadioBridgeAnyCopperPortBusy === 'function' && isRadioBridgeAnyCopperPortBusy(camObj);
    }
    if (!isCopperLanEndDeviceType(t)) return false;
    return objects.some(function(c) {
        if (!c || !c.properties || c.properties.get('type') !== 'cable') return false;
        if (!isCopperCableType(c.properties.get('cableType'))) return false;
        return c.properties.get('from') === camObj || c.properties.get('to') === camObj;
    });
}

/** Для карточки камеры: медный аплинк (коммутатор или медиаконвертер). */
function getCameraCopperUpstreamTraceContext(cameraObj) {
    if (!cameraObj || !cameraObj.properties || cameraObj.properties.get('type') !== 'camera') return { kind: 'none' };
    var cable = null;
    for (var ci = 0; ci < objects.length; ci++) {
        var c = objects[ci];
        if (!c || !c.properties || c.properties.get('type') !== 'cable') continue;
        if (!isCopperCableType(c.properties.get('cableType'))) continue;
        if (c.properties.get('from') === cameraObj || c.properties.get('to') === cameraObj) {
            cable = c;
            break;
        }
    }
    if (!cable) return { kind: 'none' };
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    var other = from === cameraObj ? to : (to === cameraObj ? from : null);
    if (!other || !other.properties) return { kind: 'none', cable: cable };
    var ot = other.properties.get('type');
    if (ot === 'node') {
        var swId = null;
        if (from === cameraObj && to === other) {
            swId = cable.properties.get('copperSwitchToId');
        } else if (to === cameraObj && from === other) {
            swId = cable.properties.get('copperSwitchFromId');
        }
        return { kind: 'node', nodeObj: other, cable: cable, copperSwitchId: swId || null };
    }
    if (ot === 'switch') {
        var pid = other.properties.get('parentNodeId') || '';
        if (!pid) return { kind: 'switch_no_parent', cable: cable };
        var parentNode = objects.find(function(n) {
            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === pid;
        });
        if (!parentNode) return { kind: 'switch_no_parent', cable: cable };
        return { kind: 'node', nodeObj: parentNode, cable: cable, copperSwitchId: other.properties.get('uniqueId') || null };
    }
    if (ot === 'mediaConverter') {
        return { kind: 'media_converter', mcObj: other, cable: cable };
    }
    return { kind: 'unknown', cable: cable };
}

/** Порт коммутатора на медном кабеле со стороны камеры (RJ45). */
function getCopperSwitchPortForCameraOnCable(cable, cameraObj) {
    if (!cable || !cameraObj || !cable.properties) return null;
    var from = cable.properties.get('from');
    if (from === cameraObj) {
        var pt = cable.properties.get('copperPortTo');
        return pt != null && pt !== '' ? parseInt(pt, 10) : null;
    }
    var pf = cable.properties.get('copperPortFrom');
    return pf != null && pf !== '' ? parseInt(pf, 10) : null;
}

/** Медное подключение камеры: upstream-устройство, кабель, камера. */
function buildCameraCopperConnectionContext(cameraObj) {
    var ctx = getCameraCopperUpstreamTraceContext(cameraObj);
    if (!cameraObj || !cameraObj.properties || ctx.kind === 'none' || ctx.kind === 'unknown' || ctx.kind === 'switch_no_parent') return null;
    if (!ctx.cable) return null;

    if (ctx.kind === 'media_converter' && ctx.mcObj) {
        return {
            cameraObj: cameraObj,
            copperCable: ctx.cable,
            upstreamObj: ctx.mcObj,
            upstreamName: (ctx.mcObj.properties.get('name') || '').trim() || 'Медиаконвертер',
            upstreamKind: 'медиаконвертер',
            upstreamGlyph: '🔀',
            copperPort: null
        };
    }

    if (ctx.kind !== 'node' || !ctx.nodeObj) return null;
    var swId = ctx.copperSwitchId;
    if (!swId) return null;
    var copperPort = getCopperSwitchPortForCameraOnCable(ctx.cable, cameraObj);
    if (copperPort != null && isNaN(copperPort)) copperPort = null;
    var swPlacemark = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'switch' && o.properties.get('uniqueId') === swId;
    });
    var attached = findAttachedSwitchOnNode(ctx.nodeObj, swId);
    var switchName = 'Коммутатор';
    if (swPlacemark) switchName = (swPlacemark.properties.get('name') || '').trim() || switchName;
    else if (attached) switchName = (attached.name || '').trim() || switchName;
    return {
        cameraObj: cameraObj,
        copperCable: ctx.cable,
        upstreamObj: swPlacemark || ctx.nodeObj,
        upstreamName: switchName,
        upstreamKind: 'коммутатор',
        upstreamGlyph: '🔌',
        copperPort: copperPort
    };
}

function buildCameraCopperConnectionSectionHtml(connCtx) {
    if (!connCtx || !connCtx.cameraObj || !connCtx.copperCable) return '';
    var cableName = connCtx.copperCable.properties.get('cableName') || getCableDescription(connCtx.copperCable.properties.get('cableType'));
    var camName = connCtx.cameraObj.properties.get('name') || 'Камера';
    var portTag = (connCtx.copperPort != null && !isNaN(connCtx.copperPort))
        ? '<span class="trace-item-tag">п.' + connCtx.copperPort + '</span>'
        : '';
    var upstreamUid = connCtx.upstreamObj ? getObjectUniqueId(connCtx.upstreamObj) : '';
    var cableUid = getObjectUniqueId(connCtx.copperCable);
    var camUid = getObjectUniqueId(connCtx.cameraObj);
    var pin = function(uid) {
        return uid ? '<button type="button" class="trace-map-pin trace-show-on-map-btn" data-object-id="' + escapeHtml(uid) + '" title="На карте" aria-label="На карте"></button>' : '';
    };
    var glyph = connCtx.upstreamGlyph || '🔌';
    var steps =
        '<div class="trace-item trace-item--object"><span class="trace-item-glyph" aria-hidden="true">' + glyph + '</span><div class="trace-item-main"><span class="trace-item-title">' + escapeHtml(connCtx.upstreamName) + '</span>' + portTag + '<span class="trace-item-kind">' + escapeHtml(connCtx.upstreamKind) + '</span></div>' + pin(upstreamUid) + '</div>' +
        '<div class="trace-item trace-item--cable trace-item--copper"><span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">↳</span><div class="trace-item-main"><span class="trace-item-cable-name">' + escapeHtml(cableName) + '</span><span class="trace-item-kind">медь</span></div>' + pin(cableUid) + '</div>' +
        '<div class="trace-item trace-item--object"><span class="trace-item-glyph" aria-hidden="true">📷</span><div class="trace-item-main"><span class="trace-item-title">' + escapeHtml(camName) + '</span><span class="trace-item-kind">камера</span></div>' + pin(camUid) + '</div>';
    return '<div class="camera-lan-trace">' +
        '<div class="trace-timeline trace-timeline--tail">' + steps + '</div></div>';
}

function buildCameraTraceSectionHtml(cameraObj) {
    var ctx = getCameraCopperUpstreamTraceContext(cameraObj);
    var html = '<section class="object-card-section object-card-section--trace camera-trace-section">';
    html += '<h4 class="object-card-section-title">Подключение</h4>';

    if (ctx.kind === 'none') {
        html += '<div class="object-card-callout object-card-callout--warn">';
        html += '<p>Подключите камеру <strong>медным кабелем</strong> к коммутатору узла, к коммутатору на карте или к медиаконвертеру — здесь появится маршрут подключения.</p>';
        html += '</div></section>';
        return html;
    }
    if (ctx.kind === 'switch_no_parent' || ctx.kind === 'unknown') {
        html += '<div class="object-card-callout object-card-callout--warn">';
        html += '<p>Медный кабель найден, но узел сети не определён. Проверьте привязку коммутатора к узлу.</p>';
        html += '</div></section>';
        return html;
    }

    var conn = buildCameraCopperConnectionContext(cameraObj);
    if (conn) {
        html += buildCameraCopperConnectionSectionHtml(conn);
        html += '</section>';
        return html;
    }

    if (ctx.kind === 'node' && ctx.nodeObj) {
        var nodeTitle = ctx.nodeObj.properties.get('name') || 'Узел сети';
        html += '<div class="object-card-callout object-card-callout--warn">';
        html += '<p>Медный кабель к узлу «' + escapeHtml(nodeTitle) + '» найден, но коммутатор на кабеле не указан. Укажите его при прокладке кабеля — тогда здесь появится маршрут до камеры.</p>';
        html += '</div></section>';
        return html;
    }
    html += '</section>';
    return html;
}

function buildCameraCardContent(obj, isEditMode, name) {
    var manufacturer = obj.properties.get('manufacturer') || '';
    var model = obj.properties.get('model') || '';
    var comment = obj.properties.get('comment') || '';
    var ipAddress = (obj.properties.get('ipAddress') || '').trim();
    var deviceLine = [manufacturer, model].filter(Boolean).join(' · ');
    var streamCfg = window.CameraPlayer ? CameraPlayer.getCameraStreamConfig(obj) : { streamType: 'none', streamUrl: '' };
    var cameraOnline = window.CameraPlayer ? CameraPlayer.isCameraOnline(obj) : false;
    var html = '<div class="camera-card">';

    html += '<section class="object-card-section camera-card-hero">';
    html += '<div class="camera-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="camera-card-hero-icon" aria-hidden="true">' +
            MapIcons.buildIconSvg('camera', { variant: 'normal', cameraOnline: cameraOnline }) + '</div>';
    }
    html += '<div class="camera-card-hero-text">';
    if (!isEditMode) {
        html += '<div class="camera-card-view-name-row">';
        html += '<div class="camera-card-view-name">' + escapeHtml(name || 'Без названия') + '</div>';
        if (window.CameraPlayer) html += CameraPlayer.buildStatusBadgeHtml(cameraOnline, CameraPlayer.getCameraStatusTitle(obj));
        html += '</div>';
        html += '<div class="camera-card-view-meta">' + escapeHtml(deviceLine || 'Камера видеонаблюдения') + '</div>';
        if (comment) {
            html += '<div class="camera-card-comment">' + escapeHtml(comment) + '</div>';
        }
        html += buildEquipmentIpAddressViewLineHtml(ipAddress, 'camera-card-comment');
    } else {
        html += '<div class="camera-card-view-name-row">';
        html += '<div class="camera-card-view-name">' + escapeHtml(name || 'Новая камера') + '</div>';
        if (window.CameraPlayer) html += CameraPlayer.buildStatusBadgeHtml(cameraOnline, CameraPlayer.getCameraStatusTitle(obj));
        html += '</div>';
        html += '<p class="object-card-hint camera-card-hero-hint">На карте подключайте только <strong>медным кабелем</strong> к коммутатору узла, отдельному коммутатору или медиаконвертеру.</p>';
    }
    html += '</div></div></section>';

    html += buildObjectCoordsSectionHtml(obj);

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Устройство</h4>';
        html += '<div class="form-group"><label for="editCameraName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editCameraName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Камера подъезд 1">';
        html += '</div>';
        html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="camera" data-type="manufacturer" data-value-id="editCameraManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editCameraManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label class="object-card-label">Модель</label>';
        html += '<div class="device-combobox" data-catalog="camera" data-type="model" data-value-id="editCameraModel" data-manufacturer-id="editCameraManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editCameraModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += buildEquipmentIpAddressEditFieldHtml('editCameraIpAddress', ipAddress);
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editCameraComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editCameraComment" class="form-input" rows="2" placeholder="Необязательно">' + escapeHtml(comment) + '</textarea></div>';
        html += '</section>';
    }

    if (window.CameraPlayer) {
        html += CameraPlayer.buildStreamSettingsHtml(streamCfg, { idPrefix: 'editCamera', isEditMode: isEditMode, obj: obj });
        html += CameraPlayer.buildSnapshotSectionHtml(obj, { isEditMode: isEditMode });
        if (isEditMode && CameraPlayer.hasActiveStream(streamCfg)) {
            html += '<section class="object-card-section object-card-section--player camera-player-section camera-player-section--preview">';
            html += '<h4 class="object-card-section-title">Предпросмотр</h4>';
            html += '<div class="camera-player-mount" data-camera-player-preview></div>';
            html += '</section>';
        }
        if (!isEditMode) {
            html += CameraPlayer.buildPlayerSectionHtml(streamCfg);
        }
    }

    if (typeof buildCameraCoverageSectionHtml === 'function') {
        html += buildCameraCoverageSectionHtml(obj, isEditMode);
    }

    html += buildCameraTraceSectionHtml(obj);
    html += '</div>';
    return html;
}

function buildOltIncomingFiberLabel(incomingFiber, cables) {
    if (!incomingFiber || !incomingFiber.cableId) return '— не задан';
    if (!isFiberExistingOnCable(incomingFiber.cableId, incomingFiber.fiberNumber)) {
        return '— не задан (жила удалена)';
    }
    var c = cables.find(function(cab) { return (cab.properties.get('uniqueId') || '') === incomingFiber.cableId; });
    if (!c) {
        c = objects.find(function(cab) {
            return cab.properties && cab.properties.get('type') === 'cable' &&
                cab.properties.get('uniqueId') === incomingFiber.cableId;
        });
    }
    var desc = c ? (c.properties.get('cableName') || getCableDescription(c.properties.get('cableType'))) : incomingFiber.cableId;
    return desc + ', жила ' + incomingFiber.fiberNumber;
}

function buildOltPortFiberLabel(ass, cables) {
    if (!ass) return '—';
    if (ass.onuId) {
        var onu = getMapObjectByUid(ass.onuId, 'onu');
        return 'ONU «' + (onu ? (onu.properties.get('name') || 'ONU') : 'ONU') + '»';
    }
    if (ass.mediaConverterId) {
        var mc = getMapObjectByUid(ass.mediaConverterId, 'mediaConverter');
        return 'МК «' + (mc ? (mc.properties.get('name') || 'МК') : 'МК') + '»';
    }
    if (ass.cableId == null) return '—';
    if (!isFiberExistingOnCable(ass.cableId, ass.fiberNumber)) return '—';
    if (ass.crossPort != null && ass.crossId) {
        var cross = objects.find(function(o) {
            return o.properties && isCrossLikeHostType(o.properties.get('type')) &&
                getObjectUniqueId(o) === ass.crossId;
        });
        var crossName = cross ? (cross.properties.get('name') || 'Кросс') : 'Кросс';
        return crossName + ', порт ' + ass.crossPort;
    }
    var c = cables.find(function(cab) { return (cab.properties.get('uniqueId') || '') === ass.cableId; });
    if (!c) {
        c = objects.find(function(cab) {
            return cab.properties && cab.properties.get('type') === 'cable' &&
                cab.properties.get('uniqueId') === ass.cableId;
        });
    }
    return c ? (c.properties.get('cableName') || getCableDescription(c.properties.get('cableType'))) + ', ж.' + ass.fiberNumber : ass.cableId + '-' + ass.fiberNumber;
}

function getOltPortLabels(oltObj) {
    return (oltObj && oltObj.properties.get('portLabels')) || {};
}

function getOltPortLabel(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return '';
    var labels = getOltPortLabels(oltObj);
    return String(labels[String(portNumber)] || '').trim();
}

function formatOltPortDisplay(portNumber, portLabel, short) {
    if (portNumber == null && !portLabel) return '—';
    var base = short ? ('п.' + portNumber) : ('порт ' + portNumber);
    if (portLabel) {
        return short ? (base + ' · ' + portLabel) : (base + ' («' + portLabel + '»)');
    }
    return base;
}

function setOltPortLabel(oltObj, portNumber, label) {
    if (!oltObj) return;
    var portLabels = Object.assign({}, getOltPortLabels(oltObj));
    var trimmed = (label || '').trim();
    if (trimmed) {
        portLabels[String(portNumber)] = trimmed;
    } else {
        delete portLabels[String(portNumber)];
    }
    oltObj.properties.set('portLabels', portLabels);
}

function buildOltCardContent(obj, isEditMode, name) {
    if (typeof syncOltLogicalState === 'function') syncOltLogicalState(obj);
    var ponPorts = Math.max(1, parseInt(obj.properties.get('ponPorts'), 10) || 8);
    var incomingFiber = typeof getDisplayOltIncomingFiber === 'function'
        ? getDisplayOltIncomingFiber(obj)
        : (obj.properties.get('incomingFiber') || null);
    var portAssignments = obj.properties.get('portAssignments') || {};
    var portLabels = getOltPortLabels(obj);
    var manufacturer = obj.properties.get('manufacturer') || '';
    var model = obj.properties.get('model') || '';
    var comment = obj.properties.get('comment') || '';
    var ipAddress = (obj.properties.get('ipAddress') || '').trim();
    var deviceLine = [manufacturer, model].filter(Boolean).join(' · ');
    var cables = getConnectedCables(obj);
    var assignedCount = Object.keys(portAssignments).filter(function(k) {
        return typeof isOltPortInUse === 'function'
            ? isOltPortInUse(obj, parseInt(k, 10))
            : false;
    }).length;
    var incomingLabel = buildOltIncomingFiberLabel(incomingFiber, cables);
    var hasIncoming = !!(incomingFiber && incomingFiber.cableId &&
        isFiberExistingOnCable(incomingFiber.cableId, incomingFiber.fiberNumber));
    var oltConnectivityIssues = typeof getOltConnectivityIssues === 'function' ? getOltConnectivityIssues(obj) : [];
    var physicalCableCount = cables.length;

    var html = '<div class="olt-card olt-card--gpon">';

    html += '<section class="object-card-section olt-card-hero">';
    html += '<div class="olt-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="olt-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('olt', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="olt-card-hero-text">';
    if (!isEditMode) {
        html += '<div class="olt-card-view-name">' + escapeHtml(name || 'Без названия') + '</div>';
        html += '<div class="olt-card-view-meta">';
        html += '<span class="olt-kind-pill">GPON</span>';
        if (deviceLine) {
            html += '<span class="olt-card-device-inline">' + escapeHtml(deviceLine) + '</span>';
        }
        html += '</div>';
        if (comment) {
            html += '<div class="olt-card-comment">' + escapeHtml(comment) + '</div>';
        }
        html += buildEquipmentIpAddressViewLineHtml(ipAddress, 'olt-card-comment');
    } else {
        html += '<div class="olt-card-view-name">' + escapeHtml(name || 'Новый OLT') + '</div>';
        html += '<div class="olt-card-view-meta"><span class="olt-kind-pill">GPON</span></div>';
        html += '<p class="object-card-hint olt-card-hero-hint"><strong>Приход</strong> — жила от кросса/муфты к OLT. <strong>PON-порты</strong> — feeder от OLT в сеть: нажмите «Подключить» и проложите кабель до муфты или кросса.</p>';
    }
    html += '</div></div>';
    html += '<dl class="olt-card-stats">';
    html += '<div class="olt-card-stat"><dt>PON-портов</dt><dd>' + ponPorts + '</dd></div>';
    html += '<div class="olt-card-stat"><dt>Назначено</dt><dd>' + assignedCount + ' / ' + ponPorts + '</dd></div>';
    html += '<div class="olt-card-stat"><dt>Кабелей</dt><dd>' + physicalCableCount + '</dd></div>';
    html += '</dl></section>';

    html += buildObjectCoordsSectionHtml(obj);

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Устройство</h4>';
        html += '<div class="form-group"><label for="editOltName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editOltName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: OLT Центральная">';
        html += '</div>';
        html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="olt" data-type="manufacturer" data-value-id="editOltManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editOltManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label class="object-card-label">Модель</label>';
        html += '<div class="device-combobox" data-catalog="olt" data-type="model" data-value-id="editOltModel" data-manufacturer-id="editOltManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editOltModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += buildEquipmentIpAddressEditFieldHtml('editOltIpAddress', ipAddress);
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editOltComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editOltComment" class="form-input" rows="2" placeholder="Дополнительные сведения">' + escapeHtml(comment) + '</textarea></div>';
        html += '</section>';
    }

    html += '<section class="object-card-section object-card-section--gpon">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">GPON</h4>';
    html += '<span class="object-card-badge object-card-badge--gpon" title="Назначено PON-портов">' + assignedCount + ' / ' + ponPorts + '</span>';
    html += '</div>';
    if (isEditMode) {
        html += '<p class="object-card-hint olt-card-gpon-hint">Два независимых назначения: <strong>приход</strong> (от кросса/муфты к OLT) и <strong>PON-порты</strong> (feeder от OLT в GPON-сеть через прокладку кабеля до муфты или кросса).</p>';
    }
    if (oltConnectivityIssues.length) {
        oltConnectivityIssues.forEach(function(issue) {
            html += '<div class="object-card-callout object-card-callout--warn"><p>' + escapeHtml(issue.message) + '</p></div>';
        });
    }
    html += '<div class="olt-card-incoming' + (hasIncoming ? ' olt-card-incoming--ok' : ' olt-card-incoming--empty') + '">';
    html += '<div class="olt-card-incoming-main">';
    html += '<span class="olt-card-incoming-label">Приход (upstream)</span>';
    html += '<span class="olt-card-incoming-value">' + escapeHtml(incomingLabel) + '</span>';
    html += '</div>';
    html += '<span class="olt-card-incoming-hint">Задаётся кнопкой «Приход OLT» у жилы в кроссе или муфте</span>';
    html += '</div>';
    html += '<h5 class="olt-card-ports-title">PON-порты</h5>';
    var ponPortTypes = typeof getOltPonPortTypes === 'function' ? getOltPonPortTypes(obj) : [];
    var kindOptsOlt = typeof getPonPortKindOptions === 'function' ? getPonPortKindOptions() : ['GPON'];

    html += '<div class="olt-ports-table-wrap"><table class="node-ports-table olt-ports-table"><thead><tr>';
    html += '<th scope="col">#</th><th scope="col">Тип</th><th scope="col">Подпись</th><th scope="col">Назначение</th>';
    html += '<th scope="col" class="node-ports-table-actions"></th>';
    html += '</tr></thead><tbody>';
    for (var p = 1; p <= ponPorts; p++) {
        var ass = portAssignments[String(p)] || null;
        var portInUse = typeof isOltPortInUse === 'function' ? isOltPortInUse(obj, p) : false;
        var assLabel = portInUse ? buildOltPortFiberLabel(ass, cables) : '—';
        var portLabel = (portLabels[String(p)] || '').trim();
        var portType = ponPortTypes[p - 1] || (typeof getPonPortDefaultKind === 'function' ? getPonPortDefaultKind() : 'GPON');
        var rowBusy = !!portInUse;
        html += '<tr class="olt-port-row ' + (rowBusy ? 'olt-port-row--busy' : 'olt-port-row--free') + '" data-port="' + p + '">';
        html += '<td class="olt-ports-table-port">' + p + '</td>';
        html += '<td class="olt-ports-table-type">';
        if (isEditMode) {
            html += '<select class="olt-port-type form-select form-select-compact" data-port="' + p + '" title="Тип PON-порта">';
            html += buildOltPortTypeOptionsHtml(portType, kindOptsOlt);
            html += '</select>';
        } else {
            html += '<span class="olt-port-type-pill">' + escapeHtml(portType) + '</span>';
        }
        html += '</td>';
        if (isEditMode) {
            html += '<td><input type="text" class="olt-port-label form-input form-input-compact" data-port="' + p + '" value="' + escapeHtml(portLabel) + '" placeholder="Сектор А" title="Подпись PON-порта"></td>';
        } else {
            html += '<td class="olt-ports-table-label">' + (portLabel ? escapeHtml(portLabel) : '—') + '</td>';
        }
        if (rowBusy) {
            html += '<td class="node-port-assign olt-port-assign">' + escapeHtml(assLabel) + '</td>';
        } else {
            html += '<td class="node-port-assign node-port-assign--free olt-port-assign">—</td>';
        }
        html += '<td class="node-ports-table-actions"><div class="olt-port-actions">';
        if (portInUse) {
            html += '<button type="button" class="btn-trace-olt-port btn-olt-trace" data-port="' + p + '">Трассировка</button>';
            if (isEditMode) {
                html += '<button type="button" class="btn-disconnect-olt-port btn-compact btn-olt-disconnect" data-port="' + p + '" title="Отключить PON-порт">Отключить</button>';
            }
        } else if (isEditMode) {
            html += '<button type="button" class="btn-olt-port-cable" data-port="' + p + '" title="Прокладка одножильного кабеля в муфту или кросс">Подключить</button>';
            html += '<button type="button" class="btn-olt-port-onu" data-port="' + p + '" title="Подключить ONU">ONU</button>';
        } else {
            html += '<span class="node-port-status node-port-status--muted">Свободен</span>';
        }
        html += '</div></td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    html += '</section>';

    html += buildObjectGallerySectionHtml(obj, isEditMode);

    if (isEditMode) {
        html += buildObjectCardActionsHtml('olt-card-actions');
    }

    html += '</div>';
    return html;
}

function validateCopperCableRoute(points, skipSync, copperMeta) {
    copperMeta = copperMeta || {};
    if (!points || points.length < 2) return false;
    if (skipSync) {
        return true;
    }
    var mid = ['support', 'attachment'];
    for (var mi = 0; mi < points.length; mi++) {
        var ptMid = points[mi].properties.get('type');
        if (mi > 0 && mi < points.length - 1) {
            if (mid.indexOf(ptMid) === -1) {
                if (!skipSync) showError('Медный кабель: промежуточные точки — только опоры связи и крепления узлов.', 'Недопустимое действие');
                return false;
            }
        }
    }
    var p0 = points[0];
    var pL = points[points.length - 1];
    var t0 = p0.properties.get('type');
    var tL = pL.properties.get('type');
    var cam0 = isCopperLanEndDeviceType(t0);
    var camL = isCopperLanEndDeviceType(tL);
    if (cam0 && camL) {
        var mcCamPair = (t0 === 'mediaConverter' && tL === 'camera') || (t0 === 'camera' && tL === 'mediaConverter');
        if (mcCamPair) {
            var mcPm = t0 === 'mediaConverter' ? p0 : pL;
            var camPm = t0 === 'camera' ? p0 : pL;
            var incMc = mcPm.properties.get('incomingFiber');
            if (!incMc || !incMc.cableId) {
                if (!skipSync) showError('Медный кабель к камере от медиаконвертера возможен только после подключения оптической жилы с муфты или кросса.', 'Недопустимое действие');
                return false;
            }
            if (cameraHasCopperCable(mcPm) || cameraHasCopperCable(camPm)) {
                if (!skipSync) showError('К этому устройству уже подключён медный кабель.', 'Подключение');
                return false;
            }
            return true;
        }
        if (!skipSync) showError('Нельзя соединить два конечных устройства (камера или медиаконвертер) одним медным кабелем.', 'Недопустимое действие');
        return false;
    }
    if (cam0 || camL) {
        var camPm = cam0 ? p0 : pL;
        var otherPm = cam0 ? pL : p0;
        var ot = otherPm.properties.get('type');
        if (ot !== 'node' && ot !== 'switch') {
            if (!skipSync) showError('Камеру или медиаконвертер можно подключить только медным кабелем от коммутатора (узел сети или отдельный коммутатор на карте).', 'Недопустимое действие');
            return false;
        }
        var sidNeed = cam0 ? copperMeta.copperSwitchToId : copperMeta.copperSwitchFromId;
        if (ot === 'node') {
            if (!sidNeed || !findAttachedSwitchOnNode(otherPm, sidNeed)) {
                if (!skipSync) showError('Для линии к камере или медиаконвертеру выберите коммутатор в узле сети.', 'Недопустимое действие');
                return false;
            }
        }
        if (cameraHasCopperCable(camPm)) {
            if (!skipSync) showError('К этому устройству уже подключён медный кабель.', 'Подключение');
            return false;
        }
        return true;
    }
    function endOk(obj, isFirst) {
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        if (t === 'switch') return true;
        if (t === 'radioBridge') return true;
        if (t === 'mediaConverter') {
            var incMc = obj.properties.get('incomingFiber');
            return !!(incMc && incMc.cableId);
        }
        if (t === 'node') {
            var sid = isFirst ? copperMeta.copperSwitchFromId : copperMeta.copperSwitchToId;
            return !!sid && !!findAttachedSwitchOnNode(obj, sid);
        }
        return false;
    }
    if (!endOk(points[0], true)) {
        if (!skipSync) showError('Медный кабель: начало маршрута — узел сети с коммутатором, отдельный коммутатор, радиомост или медиаконвертер с подключённой оптической жилой.', 'Недопустимое действие');
        return false;
    }
    if (!endOk(points[points.length - 1], false)) {
        if (!skipSync) showError('Медный кабель: конец маршрута — узел сети с коммутатором, отдельный коммутатор, радиомост или медиаконвертер с подключённой оптической жилой.', 'Недопустимое действие');
        return false;
    }
    var rb0 = t0 === 'radioBridge';
    var rbL = tL === 'radioBridge';
    if (rb0 && rbL) {
        if (!skipSync) showError('Нельзя соединить два радиомоста одним медным кабелем.', 'Недопустимое действие');
        return false;
    }
    if (rb0 || rbL) {
        var rbPm = rb0 ? p0 : pL;
        var otherPmRb = rb0 ? pL : p0;
        var otRb = otherPmRb.properties.get('type');
        if (otRb !== 'node' && otRb !== 'switch') {
            if (!skipSync) showError('Радиомост медным кабелем подключается только к коммутатору (узел сети или отдельный коммутатор на карте).', 'Недопустимое действие');
            return false;
        }
        var sidNeedRb = rb0 ? copperMeta.copperSwitchToId : copperMeta.copperSwitchFromId;
        if (otRb === 'node') {
            if (!sidNeedRb || !findAttachedSwitchOnNode(otherPmRb, sidNeedRb)) {
                if (!skipSync) showError('Для линии к радиомосту выберите коммутатор в узле сети.', 'Недопустимое действие');
                return false;
            }
        }
        var rbPort = rb0 ? copperMeta.copperPortFrom : copperMeta.copperPortTo;
        if (rbPort != null && rbPort !== '' && typeof isRadioBridgeCopperPortBusy === 'function') {
            var pnRb = parseInt(rbPort, 10);
            if (!isNaN(pnRb) && isRadioBridgeCopperPortBusy(rbPm, pnRb)) {
                if (!skipSync) showError('Порт радиомоста уже занят.', 'Подключение');
                return false;
            }
        }
        return true;
    }
    if (t0 === 'switch' && tL === 'switch') {
        var n1 = p0.properties.get('parentNodeId') || '';
        var n2 = pL.properties.get('parentNodeId') || '';
        if (!n1 || n1 !== n2) {
            if (!skipSync) showError('Два коммутатора на концах медного кабеля должны быть привязаны к одному и тому же узлу сети.', 'Недопустимое действие');
            return false;
        }
    }
    if (t0 === 'node' && tL === 'node' && getObjectUniqueId(p0) === getObjectUniqueId(pL)) {
        var sf = copperMeta.copperSwitchFromId;
        var st = copperMeta.copperSwitchToId;
        if (!sf || !st || sf === st) {
            if (!skipSync) showError('Для медного кабеля между двумя коммутаторами одного узла выберите два разных коммутатора.', 'Недопустимое действие');
            return false;
        }
    }
    return true;
}

function clearCopperCableOccupancyForCableId(cableUniqueId) {
    objects.forEach(function(o) {
        if (!o.properties) return;
        var t = o.properties.get('type');
        if (isCrossLikeHostType(t) || t === 'switch' || t === 'radioBridge') {
            var usage = o.properties.get('copperPortUsage') || {};
            var changed = false;
            Object.keys(usage).forEach(function(k) {
                if (usage[k] === cableUniqueId) {
                    delete usage[k];
                    changed = true;
                }
            });
            if (changed) o.properties.set('copperPortUsage', usage);
        } else if (t === 'node') {
            var arr = getNodeAttachedSwitches(o);
            var ch = false;
            var narr = arr.map(function(sw) {
                var u = sw.copperPortUsage || {};
                var u2 = Object.assign({}, u);
                Object.keys(u2).forEach(function(k) {
                    if (u2[k] === cableUniqueId) {
                        delete u2[k];
                        ch = true;
                    }
                });
                return Object.assign({}, sw, { copperPortUsage: u2 });
            });
            if (ch) o.properties.set('attachedSwitches', narr);
        }
    });
}

function applyCopperCableOccupancyFromCable(cable) {
    var uid = cable.properties.get('uniqueId');
    if (!uid) return;
    clearCopperCableOccupancyForCableId(uid);
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    var pf = cable.properties.get('copperPortFrom');
    var pt = cable.properties.get('copperPortTo');
    var sf = cable.properties.get('copperSwitchFromId');
    var st = cable.properties.get('copperSwitchToId');
    function mark(obj, portNum, switchId) {
        if (portNum == null || portNum === '') return;
        var pn = parseInt(portNum, 10);
        if (isNaN(pn) || pn < 1) return;
        if (!obj || !obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cross') {
            var usageC = obj.properties.get('copperPortUsage') || {};
            usageC[String(pn)] = uid;
            obj.properties.set('copperPortUsage', usageC);
        } else if (t === 'switch') {
            var usageS = obj.properties.get('copperPortUsage') || {};
            usageS[String(pn)] = uid;
            obj.properties.set('copperPortUsage', usageS);
        } else if (t === 'radioBridge') {
            var usageRb = obj.properties.get('copperPortUsage') || {};
            usageRb[String(pn)] = uid;
            obj.properties.set('copperPortUsage', usageRb);
        } else if (t === 'node' && switchId) {
            var arr = getNodeAttachedSwitches(obj).slice();
            var ix = arr.findIndex(function(s) { return s.uniqueId === switchId; });
            if (ix < 0) return;
            var sw = Object.assign({}, arr[ix]);
            var uu = Object.assign({}, sw.copperPortUsage || {});
            uu[String(pn)] = uid;
            sw.copperPortUsage = uu;
            arr[ix] = sw;
            obj.properties.set('attachedSwitches', arr);
        }
    }
    mark(fromObj, pf, sf);
    mark(toObj, pt, st);
}

function rebuildAllCopperPortUsageFromCables() {
    objects.forEach(function(o) {
        if (!o.properties) return;
        var t = o.properties.get('type');
        if (isCrossLikeHostType(t) || t === 'switch' || t === 'radioBridge') o.properties.set('copperPortUsage', {});
        if (t === 'node') {
            var arr = getNodeAttachedSwitches(o).map(function(sw) {
                return Object.assign({}, sw, { copperPortUsage: {} });
            });
            o.properties.set('attachedSwitches', arr);
        }
    });
    objects.forEach(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return;
        if (!isCopperCableType(cable.properties.get('cableType'))) return;
        applyCopperCableOccupancyFromCable(cable);
    });
}

/**
 * HTML <option> для выбора медного порта на коммутаторе (в т.ч. в узле).
 * @param {'optional'|'required'} placeholderMode optional — строка «не назначено»; required — обязательный выбор
 */
function buildCopperPortOptionsHtml(obj, selected, switchIdForNode, excludeCableUniqueId, placeholderMode) {
    placeholderMode = placeholderMode || 'optional';
    if (!obj || !obj.properties) return '<option value="">—</option>';
    var t = obj.properties.get('type');
    if (t === 'camera' || t === 'mediaConverter') {
        return '<option value="" selected>— (порт не задаётся) —</option>';
    }
    var max = 0;
    var usage = {};
    var portLabels = {};
    var manualUsage = {};
    var portTypes = [];
    if (t === 'cross') {
        max = Math.max(0, parseInt(obj.properties.get('crossCopperPorts'), 10) || 0);
        usage = obj.properties.get('copperPortUsage') || {};
    } else if (t === 'switch') {
        portTypes = obj.properties.get('switchPortTypes') || [];
        max = Array.isArray(portTypes) ? portTypes.length : 0;
        usage = obj.properties.get('copperPortUsage') || {};
        portLabels = obj.properties.get('portLabels') || {};
        manualUsage = obj.properties.get('manualPortUsage') || {};
    } else if (t === 'radioBridge') {
        var stRb = typeof getRadioBridgePortTypes === 'function' ? getRadioBridgePortTypes(obj) : (obj.properties.get('radioBridgePortTypes') || []);
        portTypes = Array.isArray(stRb) ? stRb : [];
        max = portTypes.length;
        usage = obj.properties.get('copperPortUsage') || {};
        portLabels = obj.properties.get('portLabels') || {};
        manualUsage = obj.properties.get('manualPortUsage') || {};
    } else if (t === 'node') {
        if (!switchIdForNode) return '<option value="">Нет привязки к коммутатору</option>';
        var swN = findAttachedSwitchOnNode(obj, switchIdForNode);
        if (!swN) return '<option value="">Коммутатор не найден</option>';
        portTypes = swN.switchPortTypes || [];
        max = Array.isArray(portTypes) ? portTypes.length : 0;
        usage = swN.copperPortUsage || {};
        portLabels = typeof getAttachedSwitchPortLabels === 'function' ? getAttachedSwitchPortLabels(swN) : (swN.portLabels || {});
        manualUsage = swN.manualPortUsage || {};
    }
    if (max === 0) return '<option value="">Нет портов (настройте кросс или коммутатор)</option>';
    var html = '';
    if (placeholderMode === 'required') {
        html += '<option value="" disabled selected>— выберите порт —</option>';
    } else {
        html += '<option value="">— не назначено —</option>';
    }
    for (var pi = 1; pi <= max; pi++) {
        var occup = usage[String(pi)];
        var portKind = portTypes[pi - 1] || '';
        var copperOnly = (t === 'switch' || t === 'node') && typeof isSwitchPortCopperCapable === 'function';
        var typeBlocked = copperOnly && !isSwitchPortCopperCapable(portKind);
        var dis = typeBlocked || !!(occup && (!excludeCableUniqueId || occup !== excludeCableUniqueId)) || !!manualUsage[String(pi)];
        var sel = selected != null && selected !== '' && parseInt(selected, 10) === pi;
        var lblPart = portLabels[String(pi)] ? (' — ' + portLabels[String(pi)]) : '';
        var disNote = typeBlocked ? ' (оптика)' : (dis && !typeBlocked ? ' (занят)' : '');
        html += '<option value="' + pi + '"' + (sel ? ' selected' : '') + (dis ? ' disabled' : '') + '>Порт ' + pi + lblPart + disNote + '</option>';
    }
    return html;
}

function isCopperPortAvailableForNewLay(obj, portNum, switchIdForNode) {
    if (!obj || !obj.properties) return false;
    var p = parseInt(portNum, 10);
    if (isNaN(p) || p < 1) return false;
    var t = obj.properties.get('type');
    if (t === 'cross') {
        var u = obj.properties.get('copperPortUsage') || {};
        return !u[String(p)];
    }
    if (t === 'switch') {
        var st = obj.properties.get('switchPortTypes') || [];
        if (typeof isSwitchPortCopperCapable === 'function' && !isSwitchPortCopperCapable(st[p - 1] || '')) return false;
        var fusSw = obj.properties.get('fiberPortUsage') || {};
        if (fusSw[String(p)]) return false;
        var us = obj.properties.get('copperPortUsage') || {};
        return !us[String(p)];
    }
    if (t === 'radioBridge') {
        if (typeof isRadioBridgeCopperPortBusy === 'function') return !isRadioBridgeCopperPortBusy(obj, p);
        var ur = obj.properties.get('copperPortUsage') || {};
        return !ur[String(p)];
    }
    if (t === 'node') {
        if (!switchIdForNode) return false;
        var sw = findAttachedSwitchOnNode(obj, switchIdForNode);
        if (!sw) return false;
        if (typeof isSwitchPortCopperCapable === 'function' && !isSwitchPortCopperCapable((sw.switchPortTypes || [])[p - 1] || '')) return false;
        if (typeof isAttachedSwitchPortOccupied === 'function') return !isAttachedSwitchPortOccupied(sw, p);
        var un = sw.copperPortUsage || {};
        return !un[String(p)];
    }
    return false;
}

function finishCopperCableToolSession() {
    currentCableTool = false;
    copperCableLayingActive = false;
    pendingCopperRouteFinish = null;
    var cableBtn = document.getElementById('addCable');
    if (cableBtn) {
        cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
        cableBtn.style.background = '#3498db';
    }
    cableSource = null;
    cableSourceCopperSwitchId = null;
    cableWaypoints = [];
    pendingCopperPortPreset = null;
    if (typeof clearCabinetCableSourceHighlight === 'function') clearCabinetCableSourceHighlight();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (myMap && myMap.container) {
        try {
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        } catch (eM) {}
    }
}

function tryCreateCopperToCameraWithPendingPort(points, cableTypeVal, copperMeta) {
    var pp = pendingCopperPortPreset;
    if (!pp || pp.kind !== 'node') return false;
    var startObj = points[0];
    if (!startObj || !startObj.properties || startObj.properties.get('type') !== 'node') return false;
    if (startObj.properties.get('uniqueId') !== pp.nodeUid) return false;
    var cm = Object.assign({}, copperMeta || {}, {
        copperSwitchFromId: pp.switchId,
        copperPortFrom: pp.port,
        copperPortTo: null,
        copperSwitchToId: null
    });
    if (!createCableFromPoints(points, cableTypeVal, null, null, false, false, cm)) return false;
    finishCopperCableToolSession();
    var last = objects[objects.length - 1];
    if (last && last.properties && last.properties.get('type') === 'cable' && isCopperCableType(last.properties.get('cableType'))) {
        if (typeof showCableInfo === 'function') showCableInfo(last);
    }
    return true;
}

function openCopperEndPortModal(points, cableTypeVal, copperMeta) {
    if (!points || points.length < 2 || !isCopperCableType(cableTypeVal)) return;
    copperMeta = copperMeta || {};
    var endObj = points[points.length - 1];
    var startObj = points[0];
    if (!endObj || !endObj.properties || !startObj || !startObj.properties) return;
    var endType = endObj.properties.get('type');
    var startTypeInit = startObj.properties.get('type');

    if (pendingCopperPortPreset && pendingCopperPortPreset.kind === 'radioBridge' && startTypeInit === 'radioBridge') {
        var rbUidPreset = getObjectUniqueId(startObj);
        if (rbUidPreset === pendingCopperPortPreset.rbUid) {
            copperMeta = Object.assign({}, copperMeta, { copperPortFrom: pendingCopperPortPreset.port });
        }
    }

    if (isCopperLanEndDeviceType(endType)) {
        if (cameraHasCopperCable(endObj)) {
            if (typeof showError === 'function') showError('К этому устройству уже подключён медный кабель.', 'Подключение');
            return;
        }
        if (tryCreateCopperToCameraWithPendingPort(points, cableTypeVal, copperMeta)) return;

        var startType = startObj.properties.get('type');
        if (isFiberHostType(startType)) {
            if (typeof showError === 'function') showError('Камеру или медиаконвертер можно подключить только от коммутатора.', 'Недопустимое действие');
            return;
        }
        if (startType === 'camera' && endType === 'mediaConverter') {
            var incEndMc = endObj.properties.get('incomingFiber');
            if (!incEndMc || !incEndMc.cableId) {
                if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Недопустимое действие');
                return;
            }
            if (cameraHasCopperCable(startObj) || cameraHasCopperCable(endObj)) {
                if (typeof showError === 'function') showError('К этому устройству уже подключён медный кабель.', 'Подключение');
                return;
            }
            var cmCamMc = Object.assign({}, copperMeta, { copperPortFrom: null, copperPortTo: null, copperSwitchFromId: null, copperSwitchToId: null });
            if (createCableFromPoints(points, cableTypeVal, null, null, false, false, cmCamMc)) {
                finishCopperCableToolSession();
                var lastCmMc = objects[objects.length - 1];
                if (lastCmMc && lastCmMc.properties && lastCmMc.properties.get('type') === 'cable' && isCopperCableType(lastCmMc.properties.get('cableType'))) {
                    if (typeof showCableInfo === 'function') showCableInfo(lastCmMc);
                }
            }
            return;
        }
        if (startType === 'mediaConverter' && endType === 'camera') {
            var incStartMc = startObj.properties.get('incomingFiber');
            if (!incStartMc || !incStartMc.cableId) {
                if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Недопустимое действие');
                return;
            }
            if (cameraHasCopperCable(startObj) || cameraHasCopperCable(endObj)) {
                if (typeof showError === 'function') showError('К этому устройству уже подключён медный кабель.', 'Подключение');
                return;
            }
            var cmMcCam = Object.assign({}, copperMeta, { copperPortFrom: null, copperPortTo: null, copperSwitchFromId: null, copperSwitchToId: null });
            if (createCableFromPoints(points, cableTypeVal, null, null, false, false, cmMcCam)) {
                finishCopperCableToolSession();
                var lastMcCam = objects[objects.length - 1];
                if (lastMcCam && lastMcCam.properties && lastMcCam.properties.get('type') === 'cable' && isCopperCableType(lastMcCam.properties.get('cableType'))) {
                    if (typeof showCableInfo === 'function') showCableInfo(lastMcCam);
                }
            }
            return;
        }
        if (startType === 'mediaConverter' && endType === 'mediaConverter') {
            if (typeof showError === 'function') showError('Нельзя соединять медным кабелем два медиаконвертера. От медиаконвертера прокладывайте кабель к узлу сети с коммутатором или к камере.', 'Недопустимое действие');
            return;
        }
        if (startType === 'mediaConverter') {
            var incMcStart = startObj.properties.get('incomingFiber');
            if (!incMcStart || !incMcStart.cableId) {
                if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Недопустимое действие');
                return;
            }
        }
        if (startType !== 'node' && startType !== 'switch' && startType !== 'mediaConverter') {
            if (typeof showError === 'function') showError('Камеру или медиаконвертер можно подключить только от коммутатора.', 'Недопустимое действие');
            return;
        }
        var swStartId = startType === 'node' ? (copperMeta.copperSwitchFromId || cableSourceCopperSwitchId) : null;
        if (startType === 'node' && !swStartId) {
            if (typeof showError === 'function') showError('Коммутатор для начала линии к устройству не выбран.', 'Недопустимое действие');
            return;
        }

        var pointsCopyCam = points.slice();
        pendingCopperRouteFinish = { points: pointsCopyCam, cableTypeVal: cableTypeVal, copperMeta: Object.assign({}, copperMeta, { copperPortTo: null, copperSwitchToId: null }), copperCameraEnd: true };

        var modalCam = document.getElementById('infoModal');
        var modalTitleCam = document.getElementById('modalTitle');
        var modalContentCam = document.getElementById('modalInfo');
        if (!modalCam || !modalTitleCam || !modalContentCam) return;

        modalTitleCam.textContent = 'Медный кабель: порт коммутатора';
        var labelFromCam = startType === 'switch' ? 'Порт на коммутаторе (начало маршрута)' : 'Порт на коммутаторе в узле (начало маршрута)';
        var htmlCam = '<div class="info-section"><p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:12px;">На камере и медиаконвертере порт не задаётся. Выберите свободный порт коммутатора на <strong>начале</strong> линии. После прокладки режим «Проложить кабель» выключится.</p>';
        htmlCam += '<div class="form-group" style="margin-bottom:12px;"><label for="copperEndPortSel" style="font-size:0.8125rem;">' + escapeHtml(labelFromCam) + '</label>';
        htmlCam += '<select id="copperEndPortSel" class="form-select">' + buildCopperPortOptionsHtml(startObj, null, swStartId, null, 'required') + '</select></div>';
        htmlCam += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">';
        htmlCam += '<button type="button" id="copperEndPortCancel" class="btn-secondary">Отмена</button>';
        htmlCam += '<button type="button" id="copperEndPortOk" class="btn-primary">Проложить</button></div></div>';
        modalContentCam.innerHTML = htmlCam;
        modalCam.style.display = 'block';
        currentModalObject = null;

        var btnCancelCam = document.getElementById('copperEndPortCancel');
        var btnOkCam = document.getElementById('copperEndPortOk');
        if (btnCancelCam) {
            btnCancelCam.onclick = function() {
                pendingCopperRouteFinish = null;
                modalCam.style.display = 'none';
            };
        }
        if (btnOkCam) {
            btnOkCam.onclick = function() {
                var selCam = document.getElementById('copperEndPortSel');
                var vCam = selCam && selCam.value ? parseInt(selCam.value, 10) : NaN;
                if (isNaN(vCam) || vCam < 1) {
                    if (typeof showError === 'function') showError('Выберите свободный порт на коммутаторе.', 'Порт');
                    return;
                }
                if (!isCopperPortAvailableForNewLay(startObj, vCam, swStartId)) {
                    if (typeof showError === 'function') showError('Этот порт занят. Выберите другой.', 'Порт занят');
                    return;
                }
                var prCam = pendingCopperRouteFinish;
                pendingCopperRouteFinish = null;
                modalCam.style.display = 'none';
                if (!prCam) return;
                var cmCam = Object.assign({}, prCam.copperMeta, {
                    copperPortFrom: vCam,
                    copperSwitchFromId: startType === 'node' ? (swStartId || prCam.copperMeta.copperSwitchFromId) : null,
                    copperPortTo: null,
                    copperSwitchToId: null
                });
                var okCam = createCableFromPoints(prCam.points, prCam.cableTypeVal, null, null, false, false, cmCam);
                if (okCam) {
                    finishCopperCableToolSession();
                    var lastCam = objects[objects.length - 1];
                    if (lastCam && lastCam.properties && lastCam.properties.get('type') === 'cable' && isCopperCableType(lastCam.properties.get('cableType'))) {
                        if (typeof showCableInfo === 'function') showCableInfo(lastCam);
                    }
                } else {
                    if (typeof showError === 'function') showError('Не удалось создать кабель. Проверьте маршрут и порты.', 'Ошибка');
                }
            };
        }
        return;
    }

    if (endType !== 'node' && endType !== 'switch') return;
    var toSw = endType === 'node' ? copperMeta.copperSwitchToId : null;
    if (endType === 'node' && !toSw) return;

    var pointsCopy = points.slice();
    pendingCopperRouteFinish = { points: pointsCopy, cableTypeVal: cableTypeVal, copperMeta: Object.assign({}, copperMeta) };

    var modal = document.getElementById('infoModal');
    var modalTitle = document.getElementById('modalTitle');
    var modalContent = document.getElementById('modalInfo');
    if (!modal || !modalTitle || !modalContent) return;

    modalTitle.textContent = 'Медный кабель: порт на конце';
    var labelTo = endType === 'switch' ? 'Порт на коммутаторе (конец маршрута)' : 'Порт на коммутаторе в узле (конец маршрута)';
    var htmlM = '<div class="info-section"><p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:12px;">Выберите порт для подключения на <strong>конце</strong> линии. После прокладки режим «Проложить кабель» выключится — следующий медный кабель начните снова с кнопки на панели или «Подключить» у порта коммутатора.</p>';
    htmlM += '<div class="form-group" style="margin-bottom:12px;"><label for="copperEndPortSel" style="font-size:0.8125rem;">' + escapeHtml(labelTo) + '</label>';
    htmlM += '<select id="copperEndPortSel" class="form-select">' + buildCopperPortOptionsHtml(endObj, null, toSw, null, 'required') + '</select></div>';
    htmlM += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">';
    htmlM += '<button type="button" id="copperEndPortCancel" class="btn-secondary">Отмена</button>';
    htmlM += '<button type="button" id="copperEndPortOk" class="btn-primary">Проложить</button></div></div>';
    modalContent.innerHTML = htmlM;
    modal.style.display = 'block';
    currentModalObject = null;

    var btnCancel = document.getElementById('copperEndPortCancel');
    var btnOk = document.getElementById('copperEndPortOk');
    if (btnCancel) {
        btnCancel.onclick = function() {
            pendingCopperRouteFinish = null;
            modal.style.display = 'none';
        };
    }
    if (btnOk) {
        btnOk.onclick = function() {
            var sel = document.getElementById('copperEndPortSel');
            var v = sel && sel.value ? parseInt(sel.value, 10) : NaN;
            if (isNaN(v) || v < 1) {
                if (typeof showError === 'function') showError('Выберите свободный порт на конце маршрута.', 'Порт');
                return;
            }
            if (!isCopperPortAvailableForNewLay(endObj, v, toSw)) {
                if (typeof showError === 'function') showError('Этот порт занят. Выберите другой.', 'Порт занят');
                return;
            }
            var pr = pendingCopperRouteFinish;
            pendingCopperRouteFinish = null;
            modal.style.display = 'none';
            if (!pr) return;
            var cm = Object.assign({}, pr.copperMeta, { copperPortTo: v });
            var ok = createCableFromPoints(pr.points, pr.cableTypeVal, null, null, false, false, cm);
            if (ok) {
                finishCopperCableToolSession();
                var last = objects[objects.length - 1];
                if (last && last.properties && last.properties.get('type') === 'cable' && isCopperCableType(last.properties.get('cableType'))) {
                    if (typeof showCableInfo === 'function') showCableInfo(last);
                }
            } else {
                if (typeof showError === 'function') showError('Не удалось создать кабель. Проверьте маршрут и порты.', 'Ошибка');
            }
        };
    }
}

/** Обработка клика по объекту в режиме прокладки медного кабеля. Возвращает true, если клик обработан (в т.ч. ошибка). */
function handleCopperCablePlacemarkStep(placemark, type, cableTypeVal) {
    if (!isCopperCableType(cableTypeVal)) return false;
    var rbSwitchLay = pendingCopperPortPreset && pendingCopperPortPreset.kind === 'radioBridge';
    if (type === 'splitter' || type === 'onu') {
        showError('Для медного кабеля используйте узел с коммутатором, камеру, медиаконвертер, радиомост, опору или крепление узла.', 'Недопустимое действие');
        return true;
    }
    if (isFiberHostType(type) || type === 'olt') {
        showError('Медный кабель не прокладывается к муфте, кроссу или OLT. Концы маршрута — узел сети с коммутатором, камера или медиаконвертер (с подключённой оптической жилой).', 'Недопустимое действие');
        return true;
    }
    if (rbSwitchLay && type !== 'switch' && type !== 'node' && type !== 'support' && type !== 'attachment' && type !== 'radioBridge') {
        showError('От радиомоста медный кабель прокладывается только до коммутатора. Опоры и крепления — промежуточные точки.', 'Недопустимое действие');
        return true;
    }
    if (type === 'node' && getNodeAttachedSwitches(placemark).length === 0) {
        showError('У этого узла нет коммутаторов. Добавьте коммутатор в карточке узла.', 'Недопустимое действие');
        return true;
    }
    var ep = rbSwitchLay
        ? ['radioBridge', 'switch', 'node', 'support', 'attachment']
        : ['switch', 'node', 'support', 'attachment', 'camera', 'mediaConverter'];
    if (ep.indexOf(type) === -1) {
        showError(rbSwitchLay
            ? 'Медный кабель от радиомоста: только коммутатор, опора и крепление узла.'
            : 'Медный кабель: доступны только узел с коммутатором, камера, медиаконвертер, опора и крепление узла.', 'Недопустимое действие');
        return true;
    }
    if (!cableSource) {
        if (type === 'support' || type === 'attachment') {
            showError('Начало медного кабеля должно быть узлом с коммутатором, радиомостом (кнопка «Подключить» у порта) или медиаконвертером (после подключения оптической жилы). Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
            return true;
        }
        if (type === 'radioBridge') {
            showError('Для радиомоста укажите начало линии кнопкой «Подключить» у порта в карточке устройства.', 'Недопустимое действие');
            return true;
        }
        if (type === 'mediaConverter') {
            var incMc = placemark.properties.get('incomingFiber');
            if (!incMc || !incMc.cableId) {
                showError('Медный кабель от медиаконвертера доступен только после подключения оптической жилы с муфты или кросса.', 'Недопустимое действие');
                return true;
            }
        }
        if (isCopperLanEndDeviceType(type)) {
            showError('Сначала укажите начало медной линии на узле с коммутатором или на медиаконвертере (после подключения жилы), затем кликните по камере, медиаконвертеру или второму узлу (или используйте «Подключить» на порту коммутатора).', 'Недопустимое действие');
            return true;
        }
        cableSource = placemark;
        if (type === 'node') {
            cableSourceCopperSwitchId = resolveSwitchIdForCopperNodeClick(placemark);
            if (!cableSourceCopperSwitchId) {
                cableSource = null;
                cableSourceCopperSwitchId = null;
                showError('Коммутатор не выбран или у узла нет коммутаторов.', 'Недопустимое действие');
                return true;
            }
        } else {
            cableSourceCopperSwitchId = null;
        }
        cableWaypoints = [];
        clearSelection();
        selectObject(cableSource);
        return true;
    }
    if (placemark === cableSource) {
        cableWaypoints = [];
        clearSelection();
        selectObject(cableSource);
        return true;
    }
    if (type === 'support' || type === 'attachment') {
        addCableWaypoint(placemark);
        clearSelection();
        selectObject(cableSource);
        return true;
    }
    if (isCopperLanEndDeviceType(type)) {
        var srcTEnd = cableSource.properties.get('type');
        if (isFiberHostType(srcTEnd)) {
            showError('Камеру или медиаконвертер можно подключить только от коммутатора или от медиаконвертера с оптической жилой.', 'Недопустимое действие');
            return true;
        }
    }
    if (type === 'cross' && rbSwitchLay) {
        showError('От радиомоста медный кабель прокладывается к коммутатору, не к кроссу.', 'Недопустимое действие');
        return true;
    }
    var toSwitchId = null;
    if (type === 'node') {
        toSwitchId = resolveSwitchIdForCopperNodeClick(placemark);
        if (!toSwitchId) {
            showError('Коммутатор не выбран.', 'Недопустимое действие');
            return true;
        }
    }
    var points = [cableSource].concat(cableWaypoints).concat([placemark]);
    var copperMeta = {
        copperSwitchFromId: cableSource.properties.get('type') === 'node' ? cableSourceCopperSwitchId : null,
        copperSwitchToId: type === 'node' ? toSwitchId : null
    };
    openCopperEndPortModal(points, cableTypeVal, copperMeta);
    return true;
}

function startCopperCableFromMediaConverter(mcObj) {
    if (!isEditMode || !mcObj || !mcObj.properties || mcObj.properties.get('type') !== 'mediaConverter') return;
    var inc = mcObj.properties.get('incomingFiber');
    if (!inc || !inc.cableId) {
        if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Нет входной жилы');
        return;
    }
    if (cameraHasCopperCable(mcObj)) {
        if (typeof showError === 'function') showError('К этому медиаконвертеру уже подключён медный кабель.', 'Подключение');
        return;
    }
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (splitterFiberRoutingMode && typeof cancelSplitterFiberRouting === 'function') cancelSplitterFiberRouting();
    if (fiberRoutingMode && typeof cancelFiberRouting === 'function') cancelFiberRouting();
    if (radioBridgeRoutingMode && typeof cancelRadioBridgeRouting === 'function') cancelRadioBridgeRouting();
    if (!currentCableTool) {
        var cableBtnMc = document.getElementById('addCable');
        if (cableBtnMc) cableBtnMc.click();
    }
    copperCableLayingActive = true;
    if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    pendingCopperPortPreset = null;
    cableSource = mcObj;
    cableSourceCopperSwitchId = null;
    cableWaypoints = [];
    if (typeof removePhantomPlacemark === 'function') removePhantomPlacemark();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof selectObject === 'function') selectObject(cableSource);
    var modalMc = document.getElementById('infoModal');
    if (modalMc) modalMc.style.display = 'none';
    currentModalObject = null;
    if (typeof showInfo === 'function') {
        showInfo('Укажите на карте второй конец: узел сети с коммутатором, отдельный коммутатор или камера. Опоры и крепления — только промежуточные точки.', 'Медный кабель');
    }
}

function startCopperCableFromRadioBridge(rbObj) {
    if (typeof startRadioBridgePortCopperToSwitch === 'function') startRadioBridgePortCopperToSwitch(rbObj);
}

function startCopperCableFromNodeSwitchPort(nodeObj, switchId, portNum) {
    if (!isEditMode || !nodeObj || !nodeObj.properties || nodeObj.properties.get('type') !== 'node') return;
    if (!switchId) return;
    var p = parseInt(portNum, 10);
    if (isNaN(p) || p < 1) {
        if (typeof showError === 'function') showError('Некорректный номер порта коммутатора.', 'Порт');
        return;
    }
    var sw = findAttachedSwitchOnNode(nodeObj, switchId);
    if (!sw) {
        if (typeof showError === 'function') showError('Коммутатор не найден в узле.', 'Ошибка');
        return;
    }
    var pts = sw.switchPortTypes || [];
    if (p > pts.length) {
        if (typeof showError === 'function') showError('Номер порта больше числа портов коммутатора.', 'Порт');
        return;
    }
    if (typeof isSwitchPortCopperCapable === 'function' ? !isSwitchPortCopperCapable(pts[p - 1] || '') : isSwitchPortSfpFiberType(pts[p - 1] || '')) {
        if (typeof showError === 'function') showError('Медный кабель не подключается к оптическому порту (SFP, SFP+, QSFP) — для оптики используйте жилу с кросса.', 'Недопустимое действие');
        return;
    }
    var fusStart = sw.fiberPortUsage || {};
    if (fusStart[String(p)]) {
        if (typeof showError === 'function') showError('Порт занят оптической жилой с кросса. Для меди выберите другой порт.', 'Порт занят');
        return;
    }
    var usageN = sw.copperPortUsage || {};
    if (usageN[String(p)]) {
        if (typeof showError === 'function') showError('Этот порт коммутатора уже занят медным кабелем.', 'Порт занят');
        return;
    }
    if (typeof isAttachedSwitchPortManuallyBusy === 'function' && isAttachedSwitchPortManuallyBusy(sw, p)) {
        if (typeof showError === 'function') showError('Порт отмечен как используемый. Снимите отметку «Занят», чтобы проложить кабель.', 'Порт занят');
        return;
    }
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (splitterFiberRoutingMode && typeof cancelSplitterFiberRouting === 'function') cancelSplitterFiberRouting();
    if (fiberRoutingMode && typeof cancelFiberRouting === 'function') cancelFiberRouting();
    if (!currentCableTool) {
        var cableBtn2 = document.getElementById('addCable');
        if (cableBtn2) cableBtn2.click();
    }
    copperCableLayingActive = true;
    if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    pendingCopperPortPreset = { kind: 'node', nodeUid: nodeObj.properties.get('uniqueId'), switchId: switchId, port: p };
    cableSource = nodeObj;
    cableSourceCopperSwitchId = switchId;
    cableWaypoints = [];
    if (typeof removePhantomPlacemark === 'function') removePhantomPlacemark();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof selectObject === 'function') selectObject(cableSource);
    var modal2 = document.getElementById('infoModal');
    if (modal2) modal2.style.display = 'none';
    currentModalObject = null;
    if (typeof showInfo === 'function') {
        showInfo('Укажите на карте второй конец: узел сети с коммутатором, отдельный коммутатор или камера. Опоры и крепления — только промежуточные точки.', 'Медный кабель');
    }
}

function calculateDistance(coords1, coords2) {
    const R = 6371000; 
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

var CABLE_MAP_Z_INDEX = 500;
var CONNECTION_LINE_MAP_Z_INDEX = 499;

function getConnectionLinePolylineOptions(strokeColor) {
    var width = typeof getCableWidth === 'function' ? getCableWidth('fiber') : 3;
    if (window.FiberCableConfig && FiberCableConfig.MAP_FIBER_WIDTH) {
        width = FiberCableConfig.MAP_FIBER_WIDTH;
    }
    return {
        strokeColor: strokeColor,
        strokeWidth: width,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.85,
        zIndex: CONNECTION_LINE_MAP_Z_INDEX
    };
}

function mapObjectsVisibleAtZoom(zoom) {
    if (typeof zoom !== 'number') return true;
    var thr = (typeof getLodThresholds === 'function') ? getLodThresholds() : null;
    var below = thr ? thr.objects : (typeof EXPERT_ZOOM_HIDE_OBJECTS_BELOW === 'number' ? EXPERT_ZOOM_HIDE_OBJECTS_BELOW : 16);
    return zoom >= below;
}

function getCableClickTolerance(zoom) {
    if (zoom == null && myMap) zoom = myMap.getZoom();
    if (typeof zoom !== 'number') zoom = 15;

    var baseTolerance;
    if (zoom < 10) {
        baseTolerance = 0.000003;
    } else if (zoom < 13) {
        baseTolerance = 0.000005;
    } else if (zoom < 15) {
        baseTolerance = 0.000003;
    } else {
        baseTolerance = 0.000002;
    }

    var pixelToDegree;
    if (zoom < 10) {
        pixelToDegree = 0.000002;
    } else if (zoom < 13) {
        pixelToDegree = 0.000005;
    } else if (zoom < 15) {
        pixelToDegree = 0.000004;
    } else {
        pixelToDegree = 0.000003;
    }

    return {
        baseTolerance: baseTolerance,
        pixelToDegree: pixelToDegree,
        segmentTolerance: zoom < 10 ? 0.005 : 0.01,
        widthMultiplier: zoom < 10 ? 1.1 : 1.2
    };
}

function findCableAtCoords(coords, zoom) {
    if (!coords || !Array.isArray(objects)) return null;

    var tol = getCableClickTolerance(zoom);
    var clickedCable = null;
    var minDistance = Infinity;

    objects.forEach(function(obj) {
        if (!obj || !obj.geometry || !obj.properties) return;
        if (obj.properties.get('type') !== 'cable') return;
        try {
            if (obj.options && obj.options.get('visible') === false) return;
        } catch (visErr) {}

        try {
            var cableCoordsList = (window.CableUnderground && CableUnderground.getCableDisplayGeometries)
                ? CableUnderground.getCableDisplayGeometries(obj)
                : [obj.geometry.getCoordinates()];
            if (!cableCoordsList || !cableCoordsList.length) return;

            var cableType = obj.properties.get('cableType');
            var cableWidthPixels = getCableWidth(cableType);
            var cableWidthInDegrees = (cableWidthPixels / 2) * tol.pixelToDegree;

            for (var ci = 0; ci < cableCoordsList.length; ci++) {
                var cableCoords = cableCoordsList[ci];
                if (!cableCoords || cableCoords.length < 2) continue;

                for (var seg = 0; seg < cableCoords.length - 1; seg++) {
                    var fromCoords = cableCoords[seg];
                    var toCoords = cableCoords[seg + 1];
                    var result = pointToLineDistance(coords, fromCoords, toCoords);
                    var isWithinSegment = result.param >= -tol.segmentTolerance && result.param <= 1 + tol.segmentTolerance;
                    var cableTolerance = Math.max(tol.baseTolerance, cableWidthInDegrees * tol.widthMultiplier);

                    if (isWithinSegment && result.distance < cableTolerance && result.distance < minDistance) {
                        minDistance = result.distance;
                        clickedCable = obj;
                    }
                }
            }
        } catch (error) {}
    });

    return clickedCable;
}

function ensureCableMapZIndex(cable) {
    if (!cable || !cable.options || !cable.properties || cable.properties.get('type') !== 'cable') return;
    try {
        var z = cable.options.get('zIndex');
        if (z == null || z < CABLE_MAP_Z_INDEX) cable.options.set('zIndex', CABLE_MAP_Z_INDEX);
    } catch (e) {}
}

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
        param: param 
    };
}

window.applyCopperCablePortSelection = function(cableUniqueId, fromPort, toPort) {
    var cab = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cab || !isCopperCableType(cab.properties.get('cableType'))) return;
    var fromO = cab.properties.get('from');
    var toO = cab.properties.get('to');
    var swFrom = cab.properties.get('copperSwitchFromId');
    var swTo = cab.properties.get('copperSwitchToId');
    function portFree(obj, port, switchIdForNode) {
        if (port == null || isNaN(port)) return true;
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        if (isCrossLikeHostType(t) || t === 'switch') {
            var usage = obj.properties.get('copperPortUsage') || {};
            var oc = usage[String(port)];
            return !oc || oc === cableUniqueId;
        }
        if (t === 'node') {
            if (!switchIdForNode) return false;
            var sw = findAttachedSwitchOnNode(obj, switchIdForNode);
            if (!sw) return false;
            var usageN = sw.copperPortUsage || {};
            var ocN = usageN[String(port)];
            return !ocN || ocN === cableUniqueId;
        }
        if (t === 'camera' || t === 'mediaConverter') return true;
        return false;
    }
    if (!portFree(fromO, fromPort, swFrom) || !portFree(toO, toPort, swTo)) {
        if (typeof showError === 'function') showError('Один из выбранных портов уже занят другим кабелем.', 'Порт занят');
        return;
    }
    cab.properties.set('copperPortFrom', fromPort == null || isNaN(fromPort) ? null : fromPort);
    cab.properties.set('copperPortTo', toPort == null || isNaN(toPort) ? null : toPort);
    applyCopperCableOccupancyFromCable(cab);
    saveData();
    if (typeof showInfo === 'function') showInfo('Назначение портов сохранено', 'Сохранено');
    showCableInfo(cab);
};

function resetInfoModalFiberLayout() {
    var modal = document.getElementById('infoModal');
    if (!modal) return;
    var modalContent = modal.querySelector('.modal-content');
    if (modalContent) modalContent.classList.remove('fiber-management-modal');
    modal.classList.remove('fiber-management-modal-open', 'fiber-management-modal-open--edit', 'fiber-management-modal-open--view');
    modal.removeAttribute('data-fiber-workspace');
    modal.removeAttribute('data-device-card');
    updateInfoModalChrome(null, '');
}

var INFO_MODAL_DEVICE_SUBTITLES = {
    camera: 'Видеопоток · медное подключение',
    node: 'Коммутаторы, оптика и медные порты',
    olt: 'GPON · приход и порты',
    onu: 'Подключение по оптике',
    mediaConverter: 'Оптика и медь к коммутатору',
    radioBridge: 'P2P и P2MP · радиолинки на карте',
    signalPost: 'Метка на карте · комментарий',
    cabinet: 'Контейнер оборудования · документация и состав',
    spliceCassette: 'Сращивания волокон · в ящике',
    support: 'Промежуточная точка маршрута ВОЛС',
    attachment: 'Крепление на линии · разрез кабеля',
    manhole: 'Колодец · подземный участок трассы'
};

function updateInfoModalChrome(type, name, opts) {
    opts = opts || {};
    var modal = document.getElementById('infoModal');
    var header = document.getElementById('fiberModalHeader');
    var headerMain = header ? header.querySelector('.fiber-modal-header-main') : null;
    var headerText = headerMain ? headerMain.querySelector('.fiber-modal-header-text') : null;
    var iconEl = document.getElementById('fiberModalHeaderIcon');
    var subEl = document.getElementById('modalTitleSub');
    var modalContent = modal ? modal.querySelector('.modal-content') : null;
    if (!modal || !header) return;

    var isWorkspace = opts.fiberWorkspace != null ? !!opts.fiberWorkspace : isFiberHostType(type);
    var isDeviceCard = !!(type && INFO_MODAL_DEVICE_SUBTITLES[type]);
    var showHeaderIcon = (isWorkspace || isDeviceCard) && window.MapIcons;

    modal.setAttribute('data-fiber-workspace', isWorkspace ? type : '');
    modal.setAttribute('data-device-card', isDeviceCard && !isWorkspace ? type : '');
    header.classList.toggle('fiber-modal-header--workspace', isWorkspace);
    header.classList.toggle('fiber-modal-header--device', isDeviceCard && !isWorkspace);
    if (modalContent) {
        modalContent.classList.toggle('modal-content--device-card', isDeviceCard && !isWorkspace);
    }

    if (showHeaderIcon && headerMain && headerText) {
        if (!iconEl) {
            iconEl = document.createElement('div');
            iconEl.id = 'fiberModalHeaderIcon';
            iconEl.setAttribute('aria-hidden', 'true');
            headerMain.insertBefore(iconEl, headerText);
        }
        iconEl.className = 'fiber-modal-header-icon fiber-modal-header-icon--' + type;
        var iconOpts = { variant: 'normal' };
        if (type === 'node' && currentModalObject && currentModalObject.properties) {
            iconOpts.nodeKind = currentModalObject.properties.get('nodeKind') || 'network';
        }
        iconEl.innerHTML = MapIcons.buildIconSvg(type, iconOpts);
    } else if (iconEl) {
        iconEl.remove();
    }

    if (subEl) {
        var sub = isWorkspace
            ? (type === 'cross'
                ? 'Схема, таблица и соединения жил'
                : (type === 'spliceCassette'
                    ? 'Схема, таблица и сращивания в кассете'
                    : 'Схема, таблица и сращивания волокон'))
            : (INFO_MODAL_DEVICE_SUBTITLES[type] || '');
        if (sub) {
            subEl.hidden = false;
            subEl.textContent = sub;
        } else {
            subEl.hidden = true;
            subEl.textContent = '';
        }
    }

    if ((isWorkspace || isDeviceCard) && typeof window.initPanelPlexusCanvases === 'function') {
        requestAnimationFrame(function () {
            window.initPanelPlexusCanvases(modal);
        });
    }
    if (currentModalObject) {
        updateModalLockBanner(getObjectUniqueId(currentModalObject));
    }
}

function isInfoModalVisible(modal) {
    if (!modal) return false;
    var display = modal.style.display;
    return display === 'flex' || display === 'block';
}

function closeInfoModal(opts) {
    if (!opts || !opts.force) {
        if (typeof window.isConfirmModalOpen === 'function' && window.isConfirmModalOpen()) {
            return;
        }
    }
    traceReturnContext = null;
    var traceHeaderOnClose = document.getElementById('fiberModalHeader');
    if (traceHeaderOnClose) traceHeaderOnClose.classList.remove('fiber-modal-header--trace');
    if (currentModalObject) {
        var modalType = currentModalObject.properties && currentModalObject.properties.get('type');
        if (isFiberHostType(modalType)) {
            flushPendingFiberSchemeViewState(currentModalObject);
        }
        var flushUid = getObjectUniqueId(currentModalObject);
        if (flushUid) flushSyncPushForUid(flushUid);
    }
    var modal = document.getElementById('infoModal');
    if (!modal) return;
    modal.removeAttribute('data-trace-view');
    if (window.FiberTrace && FiberTrace.removeTraceModalPdfBar) {
        FiberTrace.removeTraceModalPdfBar();
    }
    var modalInfo = document.getElementById('modalInfo');
    if (window.CameraPlayer && modalInfo) CameraPlayer.destroyPlayersInRoot(modalInfo);
    resetInfoModalFiberLayout();
    if (typeof pendingCopperRouteFinish !== 'undefined' && pendingCopperRouteFinish) {
        pendingCopperRouteFinish = null;
    }
    modal.style.display = 'none';
    currentModalObject = null;
    infoModalEditModeSession = false;
    infoModalEditMode = true;
    releaseHeldObjectLock();
    var lockBanner = document.getElementById('modalLockBanner');
    if (lockBanner) {
        lockBanner.hidden = true;
        lockBanner.textContent = '';
    }
    if (typeof clearFiberConnectionLabelSelection === 'function') clearFiberConnectionLabelSelection();
}

function relayoutUndergroundSpanFromCableCard(cableUniqueId, spanIndex) {
    var cable = objects.find(function (obj) {
        return obj && obj.properties && obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cable || !isEditMode || !canEdit()) return;
    if (typeof closeInfoModal === 'function') closeInfoModal();
    startUndergroundSpanRelayout(cable, spanIndex);
}
window.relayoutUndergroundSpanFromCableCard = relayoutUndergroundSpanFromCableCard;

function buildCableInfoUndergroundHtml(cable, uniqueId) {
    if (!window.CableUnderground || !CableUnderground.getUndergroundSpansInfo) return '';
    var spansInfo = CableUnderground.getUndergroundSpansInfo(cable);
    if (!spansInfo.length) return '';

    var ugTotal = CableUnderground.getUndergroundDistanceMeters(cable);
    var html = '';
    html += '<div class="cable-info-underground-block" style="margin-bottom: 16px; padding: 12px; background: rgba(220, 38, 38, 0.06); border-radius: 8px; border: 1px solid rgba(220, 38, 38, 0.25);">';
    html += '<h4 style="margin: 0 0 10px 0; color: #dc2626; font-size: 0.875rem; font-weight: 600;">🕳 Подземные участки (' + spansInfo.length + ')</h4>';
    html += '<p style="margin: 0 0 12px 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.45;">';
    html += 'Между колодцами кабель идёт под землёй (красный пунктир на карте). Воздушный зелёный участок на этом отрезке не отображается.';
    html += '</p>';

    spansInfo.forEach(function (sp) {
        html += '<div class="cable-info-underground-span" style="padding: 10px 12px; margin-bottom: 8px; background: var(--bg-card); border-radius: 8px; border-left: 3px solid #dc2626;">';
        html += '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">';
        html += '<div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary);">Участок ' + (sp.index + 1) + '</div>';
        html += '<div style="font-size: 0.8rem; font-weight: 600; color: #dc2626; white-space: nowrap;">' + sp.distanceM + ' м</div>';
        html += '</div>';
        html += '<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-secondary);">';
        html += '<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;"><span>⬤</span><span><strong>Вход:</strong> ' + escapeHtml(sp.entryName) + '</span></div>';
        html += '<div style="display: flex; align-items: center; gap: 6px;"><span>⬤</span><span><strong>Выход:</strong> ' + escapeHtml(sp.exitName) + '</span></div>';
        html += '</div>';
        if (sp.pathPoints > 0) {
            html += '<div style="margin-top: 6px; font-size: 0.72rem; color: var(--text-muted);">Точек трассы на карте: ' + sp.pathPoints + '</div>';
        }
        if (modalIsEditMode() && !cableUndergroundEditMode) {
            html += '<button type="button" class="btn-secondary btn-compact" style="margin-top: 10px; width: 100%;" onclick="relayoutUndergroundSpanFromCableCard(\'' + uniqueId + '\', ' + sp.index + ')">Переложить участок на карте</button>';
        }
        html += '</div>';
    });

    html += '<div style="font-size: 0.8125rem; color: var(--text-secondary); padding-top: 4px; border-top: 1px dashed rgba(220, 38, 38, 0.2);">';
    html += '<strong>Суммарно под землёй:</strong> ' + Math.round(ugTotal) + ' м';
    html += '</div>';

    if (modalIsEditMode() && !cableUndergroundEditMode) {
        html += '<p class="object-card-hint" style="margin: 12px 0 0 0; font-size: 0.75rem;">Либо кликните по <strong>красному пунктиру</strong> на карте — откроется перепрокладка с теми же колодцами.</p>';
    }

    html += '</div>';
    return html;
}

function showCableInfo(cable) {
    resetInfoModalFiberLayout();
    if (objectPlacementMode) {
        return;
    }
    if (cableSplitSuppressInfoUntil && Date.now() < cableSplitSuppressInfoUntil) {
        return;
    }
    if (radioBridgeRoutingMode && radioBridgeRoutingData) {
        return;
    }
    if (cableSplitMode && cableSplitData) {
        if (cable && cable.geometry) {
            var splitCoords = null;
            try {
                if (typeof window.lastMapClickCoords !== 'undefined' && window.lastMapClickCoords) {
                    splitCoords = window.lastMapClickCoords;
                }
            } catch (eSc) {}
            if (!splitCoords) {
                var gc = cable.geometry.getCoordinates();
                if (gc && gc.length) splitCoords = gc[Math.floor(gc.length / 2)];
            }
            if (splitCoords) {
                handleCableSplitMapClick(splitCoords, cable);
                return;
            }
        }
        return;
    }

    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }

    showInfoModalLoadingShell('Кабель');
    applyModalEditModeForObject(cable, function() {
        deferHeavyModalWork(function() {
            showCableInfoBody(cable);
        });
    });
}

function showCableInfoBody(cable) {
    bindCableDeleteDelegation();
    const cableType = cable.properties.get('cableType');
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    const uniqueId = cable.properties.get('uniqueId');
    const cableName = cable.properties.get('cableName') || '';
    const cableNamePlaceholder = cableName
        ? 'Введите название кабеля'
        : ((typeof buildCableRouteDisplayName === 'function' ? buildCableRouteDisplayName(cable) : '') ||
            getCableDescription(cableType, cable) ||
            'Например: Муфта → Кросс');
    const cableProduct = getCableProductFromObject(cable);
    const cableProductLabel = getCableProductLabel(cableProduct.manufacturer, cableProduct.model);
    const fiberCount = getFiberCount(cable);
    const fibers = getFiberColors(cable);
    
    const cableDescription = getCableDescription(cableType, cable);

    const fromUniqueId = fromObj ? fromObj.properties.get('uniqueId') : null;
    const toUniqueId = toObj ? toObj.properties.get('uniqueId') : null;
    
    const parallelCables = objects.filter(obj => {
        if (!obj.properties || obj.properties.get('type') !== 'cable') return false;
        if (obj.properties.get('uniqueId') === uniqueId) return false; 
        
        const objFrom = obj.properties.get('from');
        const objTo = obj.properties.get('to');
        if (!objFrom || !objTo) return false;
        
        const objFromId = objFrom.properties.get('uniqueId');
        const objToId = objTo.properties.get('uniqueId');

        return (objFromId === fromUniqueId && objToId === toUniqueId) ||
               (objFromId === toUniqueId && objToId === fromUniqueId);
    });

    const getObjInfo = (obj) => {
        if (!obj || !obj.properties) return { type: 'Объект', name: '', icon: '📍' };
        const type = obj.properties.get('type');
        const name = obj.properties.get('name') || '';
        let typeName = 'Объект';
        let icon = '📍';
        if (type === 'support') { typeName = 'Опора связи'; icon = '📍'; }
        else if (type === 'sleeve') { typeName = 'Кабельная муфта'; icon = '🔴'; }
        else if (type === 'spliceCassette') { typeName = 'Сплайс-кассета'; icon = '🟠'; }
        else if (type === 'cross') { typeName = 'Оптический кросс'; icon = '📦'; }
        else if (type === 'node') { typeName = 'Узел сети'; icon = '🖥️'; }
        else if (type === 'attachment') { typeName = 'Крепление узлов'; icon = '🔗'; }
        else if (type === 'manhole') { typeName = 'Колодец'; icon = '⬤'; }
        else if (type === 'signalPost') { typeName = 'Сигнальный столб'; icon = '🚏'; }
        else if (type === 'switch') { typeName = 'Коммутатор'; icon = '🔀'; }
        else if (type === 'olt') { typeName = 'OLT (GPON)'; icon = '📶'; }
        else if (type === 'onu') { typeName = 'ONU'; icon = '📟'; }
        else if (type === 'splitter') { typeName = 'Сплиттер'; icon = '🔀'; }
        else if (type === 'camera') { typeName = 'Камера'; icon = '📷'; }
        else if (type === 'mediaConverter') { typeName = 'Медиаконвертер'; icon = '⇄'; }
        else if (type === 'radioBridge') { typeName = 'Wi‑Fi радиомост'; icon = '◎'; }
        return { type: typeName, name, icon };
    };
    
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalInfo');
    
    if (!modal || !modalContent) {
        console.error('Модальное окно не найдено!');
        return;
    }

    if (isCopperCableType(cableType)) {
        modalTitle.textContent = '🔌 Медный кабель';
        const copperColor = '#b45309';
        const pf = cable.properties.get('copperPortFrom');
        const pt = cable.properties.get('copperPortTo');
        const swFromCable = cable.properties.get('copperSwitchFromId');
        const swToCable = cable.properties.get('copperSwitchToId');
        function buildCopperPortOptions(obj, selected, switchIdForNode) {
            return buildCopperPortOptionsHtml(obj, selected, switchIdForNode, uniqueId, 'optional');
        }
        const fromInfoCu = getObjInfo(fromObj);
        const toInfoCu = getObjInfo(toObj);
        var distCu = cable.properties.get('distance');
        if (distCu == null && cable.geometry) {
            try {
                var gc = cable.geometry.getCoordinates();
                if (gc && gc.length >= 2) {
                    var sum = 0;
                    for (var di = 0; di < gc.length - 1; di++) sum += calculateDistance(gc[di], gc[di + 1]);
                    distCu = sum;
                }
            } catch (eD) {}
        }
        var htmlCu = '<div class="info-section">';
        htmlCu += '<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 12px;">Один медный кабель — одна линия. Назначьте порты на коммутаторах на концах (в узле или отдельная точка на карте). У камеры и медиаконвертера порт не задаётся. Занятые порты нельзя выбрать для другого кабеля.</p>';
        htmlCu += '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-color);">';
        htmlCu += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><span>' + fromInfoCu.icon + '</span><div><strong>' + escapeHtml(fromInfoCu.type) + '</strong>' + (fromInfoCu.name ? '<br><span style="font-size: 0.8rem; color: var(--text-secondary);">' + escapeHtml(fromInfoCu.name) + '</span>' : '') + '</div></div>';
        htmlCu += '<div style="margin-left: 14px; padding-left: 14px; border-left: 2px dashed ' + copperColor + '; margin-bottom: 8px;"><span style="font-size: 0.75rem; color: var(--text-muted);">↓</span></div>';
        htmlCu += '<div style="display: flex; align-items: center; gap: 8px;"><span>' + toInfoCu.icon + '</span><div><strong>' + escapeHtml(toInfoCu.type) + '</strong>' + (toInfoCu.name ? '<br><span style="font-size: 0.8rem; color: var(--text-secondary);">' + escapeHtml(toInfoCu.name) + '</span>' : '') + '</div></div></div>';
        if (modalIsEditMode()) {
            htmlCu += '<div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.8125rem;">Порт на начале маршрута (' + escapeHtml(fromInfoCu.type) + ')</label>';
            htmlCu += '<select id="copperPortFromSel" class="form-select">' + buildCopperPortOptions(fromObj, pf, swFromCable) + '</select></div>';
            htmlCu += '<div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.8125rem;">Порт на конце маршрута (' + escapeHtml(toInfoCu.type) + ')</label>';
            htmlCu += '<select id="copperPortToSel" class="form-select">' + buildCopperPortOptions(toObj, pt, swToCable) + '</select></div>';
            htmlCu += '<button type="button" class="btn-primary" id="saveCopperPortsBtn">Сохранить назначение портов</button>';
        } else {
            htmlCu += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;"><strong>Порт «от»:</strong> ' + (pf != null && pf !== '' ? String(pf) : '—') + '</div>';
            htmlCu += '<div style="font-size: 0.875rem; color: var(--text-secondary);"><strong>Порт «до»:</strong> ' + (pt != null && pt !== '' ? String(pt) : '—') + '</div>';
        }
        htmlCu += '<div style="margin-top: 12px; font-size: 0.8125rem; color: var(--text-muted);">Длина по маршруту: ' + (distCu != null ? distCu + ' м' : '—') + '</div>';
        htmlCu += '</div>';
        if (modalIsEditMode()) {
            htmlCu += '<div style="padding-top: 16px; border-top: 1px solid var(--border-color);"><button type="button" class="btn-danger" data-action="delete-cable" data-cable-id="' + escapeHtml(uniqueId) + '">Удалить кабель</button></div>';
        }
        modalContent.innerHTML = htmlCu;
        var saveCuBtn = modalContent.querySelector('#saveCopperPortsBtn');
        if (saveCuBtn) {
            saveCuBtn.addEventListener('click', function() {
                var sf = document.getElementById('copperPortFromSel');
                var st = document.getElementById('copperPortToSel');
                var vf = sf && sf.value ? parseInt(sf.value, 10) : null;
                var vt = st && st.value ? parseInt(st.value, 10) : null;
                if (window.applyCopperCablePortSelection) window.applyCopperCablePortSelection(uniqueId, vf, vt);
            });
        }
        modal.style.display = 'block';
        currentModalObject = cable;
        updateModalLockBanner(uniqueId);
        applyObjectLocksToMapDraggable();
        return;
    }

    modalTitle.textContent = (cable.properties.get('undergroundSpans') || []).length
        ? '🔌 Кабель ВОЛС · с подземным участком'
        : '🔌 Информация о кабеле';

    var cableColor = getCableColor(cableType);
    
    let html = '<div class="info-section">';

    html += `<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; background: linear-gradient(135deg, ${cableColor}15, ${cableColor}05); border-radius: 8px; border-left: 4px solid ${cableColor};">`;
    html += `<div style="width: 40px; height: 40px; background: ${cableColor}; border-radius: 8px; display: flex; align-items: center; justify-content: center;">`;
    html += `<span style="color: white; font-size: 18px;">🔌</span></div>`;
    html += `<div><h3 style="margin: 0; color: var(--text-primary); font-size: 1rem;">${cableDescription}</h3>`;
    html += `<span style="font-size: 0.8rem; color: var(--text-muted);">${fiberCount} жил</span>`;
    if (cableProductLabel) {
        html += `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">${escapeHtml(cableProductLabel)}</div>`;
    }
    html += `</div></div>`;

    html += '<div class="form-group" style="margin-bottom: 16px;">';
    html += '<label style="display: block; margin-bottom: 6px; font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">Тип кабеля (марка и модель)</label>';
    if (modalIsEditMode()) {
        html += '<label for="editCableManufacturerTrigger" class="form-group-sub">Марка</label>';
        html += '<div class="device-combobox" data-catalog="cable" data-type="manufacturer" data-value-id="editCableManufacturer">';
        html += '<button type="button" class="device-combobox-trigger" id="editCableManufacturerTrigger" aria-expanded="false" aria-haspopup="listbox">' + (cableProduct.manufacturer ? escapeHtml(cableProduct.manufacturer) : 'Выберите марку') + '</button>';
        html += '<input type="hidden" id="editCableManufacturer" value="' + escapeHtml(cableProduct.manufacturer) + '">';
        html += '<div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div>';
        html += '<label for="editCableModelTrigger" class="form-group-sub">Модель</label>';
        html += '<div class="device-combobox" data-catalog="cable" data-type="model" data-value-id="editCableModel" data-manufacturer-id="editCableManufacturer">';
        html += '<button type="button" class="device-combobox-trigger" id="editCableModelTrigger" aria-expanded="false" aria-haspopup="listbox">' + (cableProduct.model ? escapeHtml(cableProduct.model) : 'Выберите модель') + '</button>';
        html += '<input type="hidden" id="editCableModel" value="' + escapeHtml(cableProduct.model) + '">';
        html += '<div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div>';
        html += '<button type="button" class="btn-secondary btn-inline" id="saveCableProductBtn" style="margin-top: 8px;">Сохранить тип кабеля</button>';
    } else {
        html += `<div style="padding: 10px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-primary);">${cableProductLabel ? escapeHtml(cableProductLabel) : '<span style="color: var(--text-muted); font-style: italic;">Не указано</span>'}</div>`;
    }
    html += '</div>';

    html += '<div class="form-group" style="margin-bottom: 16px;">';
    html += '<label style="display: block; margin-bottom: 6px; font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">Название кабеля</label>';
    if (modalIsEditMode()) {
        html += `<input type="text" id="cableNameInput" class="form-input" value="${escapeHtml(cableName)}" placeholder="${escapeHtml(cableNamePlaceholder)}" 
            oninput="updateCableName('${uniqueId}', this.value)" onchange="updateCableName('${uniqueId}', this.value)">`;
        if (!cableName) {
            html += '<p class="form-hint" style="margin-top:6px;">Если не задано, в схеме и PDF: «Кабель 1», тип ВОЛС или маршрут между объектами.</p>';
        }
    } else {
        html += `<div style="padding: 10px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-primary);">${cableName ? escapeHtml(cableName) : '<span style="color: var(--text-muted); font-style: italic;">Не задано</span>'}</div>`;
    }
    html += '</div>';

    var lengthMVal = cable.properties.get('lengthM');
    var lengthMStr = (lengthMVal != null && lengthMVal !== '' && !isNaN(Number(lengthMVal))) ? String(Number(lengthMVal)) : '';
    html += '<div class="form-group" style="margin-bottom: 16px;">';
    html += '<label for="cableLengthMInput" style="display: block; margin-bottom: 6px; font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">Длина кабеля, м</label>';
    if (modalIsEditMode()) {
        html += '<input type="number" id="cableLengthMInput" class="form-input" min="0" step="0.1" value="' + escapeHtml(lengthMStr) + '" placeholder="По геометрии карты" oninput="updateCableLengthM(\'' + uniqueId + '\', this.value)" onchange="updateCableLengthM(\'' + uniqueId + '\', this.value)">';
        html += '<p class="form-hint" style="margin-top:6px;">Если задано — используется в трассе вместо длины по карте. Пусто — расчёт по маршруту.</p>';
    } else {
        html += '<div style="padding: 10px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-primary);">' +
            (lengthMStr ? (escapeHtml(lengthMStr) + ' м') : '<span style="color: var(--text-muted); font-style: italic;">По геометрии</span>') + '</div>';
    }
    html += '</div>';

    if (modalIsEditMode()) {
        html += '<div class="cable-fiber-settings-row form-group">';
        html += '<label>Число жил и цвета</label>';
        html += '<div class="cable-fiber-settings-toolbar">';
        html += '<input type="number" id="cableFiberCountInput" class="form-input cable-fiber-count-input" min="1" max="96" value="' + fiberCount + '" aria-label="Число жил">';
        html += '<button type="button" class="btn-secondary btn-cable-palette-edit" id="cableFiberPaletteBtn">' + (window.FiberCableConfig && window.FiberCableConfig.cablePaletteButtonHtml ? window.FiberCableConfig.cablePaletteButtonHtml() : 'Цвета') + '</button>';
        html += '<button type="button" class="btn-primary btn-inline" id="cableFiberCountSaveBtn">Применить</button>';
        html += '</div></div>';
    }

    let displayDistance = cable.properties.get('distance');
    if (displayDistance == null && cable.geometry) {
        try {
            var gcDist = cable.geometry.getCoordinates();
            if (gcDist && gcDist.length >= 2) {
                displayDistance = 0;
                for (var di2 = 0; di2 < gcDist.length - 1; di2++) {
                    displayDistance += calculateDistance(gcDist[di2], gcDist[di2 + 1]);
                }
                cable.properties.set('distance', displayDistance);
            }
        } catch (eDist) {}
    }
    if (displayDistance == null) displayDistance = 'неизвестно';

    var ugDist = window.CableUnderground ? CableUnderground.getUndergroundDistanceMeters(cable) : 0;
    var ugSpansCount = (cable.properties.get('undergroundSpans') || []).length;
    var aerialDist = (typeof displayDistance === 'number' && ugSpansCount > 0)
        ? Math.max(0, Math.round(displayDistance - ugDist))
        : null;

    const totalCablesOnSegment = parallelCables.length + 1;

    html += '<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">';
    html += `<div style="flex: 1 1 100px; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">`;
    html += `<div style="font-size: 0.7rem; color: var(--accent-primary); margin-bottom: 2px;">Всего по маршруту</div>`;
    if (typeof displayDistance === 'number') {
        html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${Math.round(displayDistance)} м</div>`;
    } else {
        html += `<div style="font-size: 0.9rem; color: var(--text-muted);">${displayDistance}</div>`;
    }
    html += `</div>`;
    if (ugSpansCount > 0 && typeof displayDistance === 'number') {
        html += `<div style="flex: 1 1 90px; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">`;
        html += `<div style="font-size: 0.7rem; color: ${cableColor}; margin-bottom: 2px;">Воздух</div>`;
        html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${aerialDist} м</div>`;
        html += `</div>`;
        html += `<div style="flex: 1 1 90px; padding: 10px; background: rgba(220, 38, 38, 0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(220, 38, 38, 0.2);">`;
        html += `<div style="font-size: 0.7rem; color: #dc2626; margin-bottom: 2px;">Под землёй</div>`;
        html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${Math.round(ugDist)} м</div>`;
        html += `<div style="font-size: 0.65rem; color: var(--text-muted);">${ugSpansCount} уч.</div>`;
        html += `</div>`;
    }
    html += `<div style="flex: 1; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">`;
    html += `<div style="font-size: 0.7rem; color: var(--accent-success); margin-bottom: 2px;">Жил</div>`;
    html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${fiberCount}</div>`;
    html += `</div>`;
    html += `<div style="flex: 1; padding: 10px; background: ${totalCablesOnSegment > 1 ? 'var(--bg-accent)' : 'var(--bg-tertiary)'}; border-radius: 8px; text-align: center; border: 1px solid ${totalCablesOnSegment > 1 ? 'var(--accent-warning)' : 'var(--border-color)'};">`;
    html += `<div style="font-size: 0.7rem; color: ${totalCablesOnSegment > 1 ? 'var(--accent-warning)' : 'var(--text-muted)'}; margin-bottom: 2px;">На участке</div>`;
    html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${totalCablesOnSegment} каб.</div>`;
    html += `</div></div>`;

    html += buildCableInfoUndergroundHtml(cable, uniqueId);

    if (parallelCables.length > 0) {
        html += '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-accent); border-radius: 8px; border: 1px solid var(--accent-warning);">';
        html += `<h4 style="margin: 0 0 10px 0; color: var(--accent-warning); font-size: 0.8rem; font-weight: 600;">📦 Другие кабели на этом участке (${parallelCables.length})</h4>`;
        html += '<div style="display: flex; flex-direction: column; gap: 6px;">';
        
        parallelCables.forEach((pCable, idx) => {
            const pType = pCable.properties.get('cableType');
            const pName = pCable.properties.get('cableName') || '';
            const pDesc = getCableDescription(pType, pCable);
            const pFibers = getFiberCount(pCable);
            const pId = pCable.properties.get('uniqueId');
            const pColor = getCableColor(pType);
            
            html += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--bg-card); border-radius: 6px; border-left: 3px solid ${pColor}; cursor: pointer;" onclick="showCableInfoById('${pId}')">`;
            html += `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${pColor};"></div>`;
            html += `<div style="flex: 1; min-width: 0;">`;
            html += `<div style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">${pName ? escapeHtml(pName) : pDesc}</div>`;
            if (pName) html += `<div style="font-size: 0.7rem; color: var(--text-muted);">${pDesc}</div>`;
            html += `</div>`;
            html += `<div style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap;">${pFibers} жил</div>`;
            html += `</div>`;
        });
        
        html += '</div></div>';
    }

    html += '<div style="margin-bottom: 16px;">';
    html += '<h4 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 0.875rem; font-weight: 600;">🌈 Жилы кабеля</h4>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
    fibers.forEach(fiber => {
        html += `<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-card); border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.8rem;">`;
        html += `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${fiber.color}; border: ${fiber.hasBlackRing ? '2px solid #000' : '1px solid rgba(0,0,0,0.2)'};"></div>`;
        html += `<span style="color: var(--text-primary); font-weight: 500;">${fiber.number}</span>`;
        html += `<span style="color: var(--text-muted); font-size: 0.7rem;">${fiber.name}</span>`;
        html += `</div>`;
    });
    html += '</div></div>';

    if (modalIsEditMode()) {
        html += '<div class="cable-split-toolbar">';
        html += '<div class="cable-split-toolbar__sleeve">' + buildCableSplitSleeveFieldsHtml() + '</div>';
        html += '<button type="button" id="btnSplitCableSleeve" class="btn-cable-split-start">🔴 Установить муфту на кабеле</button>';
        html += '<button id="saveCableChangesBtn" class="btn-primary" style="flex: 1; min-width: 140px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Сохранить</button>';
        html += '<button type="button" class="btn-danger" data-action="delete-cable" data-cable-id="' + escapeHtml(uniqueId) + '" style="flex: 1; min-width: 120px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">';
        html += '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>';
        html += '</svg>Удалить кабель</button>';
        html += '</div>';
    }
    
    html += '</div>';
    
    modalContent.innerHTML = html;
    initDeviceComboboxes(modalContent);
    bindCableSplitSleeveFields(modalContent);
    var saveCableProductBtn = modalContent.querySelector('#saveCableProductBtn');
    if (saveCableProductBtn) {
        saveCableProductBtn.addEventListener('click', function() {
            var mEl = document.getElementById('editCableManufacturer');
            var modEl = document.getElementById('editCableModel');
            updateCableProduct(uniqueId, mEl ? mEl.value : '', modEl ? modEl.value : '');
        });
    }
    var fiberCountSaveBtn = modalContent.querySelector('#cableFiberCountSaveBtn');
    var fiberCountInput = modalContent.querySelector('#cableFiberCountInput');
    var fiberPaletteBtn = modalContent.querySelector('#cableFiberPaletteBtn');
    if (fiberCountSaveBtn && fiberCountInput) {
        fiberCountSaveBtn.addEventListener('click', async function() {
            await updateCableFiberSettings(uniqueId, fiberCountInput.value, undefined);
        });
    }
    if (fiberPaletteBtn && window.FiberCableConfig) {
        fiberPaletteBtn.addEventListener('click', function() {
            window.FiberCableConfig.openFiberPaletteEditor({
                title: 'Цвета жил кабеля',
                fiberCount: getFiberCount(cable),
                palette: window.FiberCableConfig.getFiberPaletteForCable(cable),
                onSave: async function(r) {
                    await updateCableFiberSettings(uniqueId, r.fiberCount, r.palette);
                }
            });
        });
    }
    var saveCableBtn = modalContent.querySelector('#saveCableChangesBtn');
    if (saveCableBtn) {
        saveCableBtn.addEventListener('click', function() {
            saveData();
            showInfo('Изменения сохранены', 'Сохранено');
        });
    }
    var splitCableBtn = modalContent.querySelector('#btnSplitCableSleeve');
    if (splitCableBtn) {
        splitCableBtn.addEventListener('click', function() {
            var sleeveOpts = readCableSplitSleeveOptions(modalContent);
            startCableSplitPickOnCable(cable, sleeveOpts);
        });
    }
    modal.style.display = 'block';
    currentModalObject = cable;
    updateModalLockBanner(uniqueId);
    applyObjectLocksToMapDraggable();
}

function showCableInfoById(cableUniqueId) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (cable) {
        showCableInfo(cable);
    }
}

function updateCableName(cableUniqueId, newName) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (cable) {
        cable.properties.set('cableName', newName);
        saveData();
    }
}

function updateCableLengthM(cableUniqueId, rawValue) {
    const cable = objects.find(obj =>
        obj.properties &&
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    if (!cable) return;
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) {
        cable.properties.set('lengthM', null);
    } else {
        var n = parseFloat(trimmed.replace(',', '.'));
        if (isNaN(n) || n < 0) return;
        cable.properties.set('lengthM', Math.round(n * 10) / 10);
    }
    saveData({ objects: [cable] });
}

function applyHostReserveMChange(rawValue) {
    if (!currentModalObject || !currentModalObject.properties) return;
    var t = currentModalObject.properties.get('type');
    if (t !== 'sleeve' && t !== 'cross' && t !== 'spliceCassette' && !isCrossLikeHostType(t)) return;
    var trimmed = String(rawValue == null ? '' : rawValue).trim();
    if (!trimmed) {
        currentModalObject.properties.set('reserveM', null);
    } else {
        var n = parseFloat(trimmed.replace(',', '.'));
        if (isNaN(n) || n < 0) return;
        currentModalObject.properties.set('reserveM', Math.round(n * 10) / 10);
    }
    saveData({ object: currentModalObject });
}

function flushHostReserveMFromEditor() {
    var inp = document.getElementById('editHostReserveM');
    if (!inp || !currentModalObject || !currentModalObject.properties) return;
    var cur = currentModalObject.properties.get('reserveM');
    var curStr = (cur != null && cur !== '' && !isNaN(Number(cur))) ? String(Number(cur)) : '';
    var next = String(inp.value == null ? '' : inp.value).trim();
    if (next !== curStr) applyHostReserveMChange(next);
}

function buildHostReserveMFieldHtml(obj, isEditMode) {
    if (!obj || !obj.properties) return '';
    var reserveVal = obj.properties.get('reserveM');
    var reserveStr = (reserveVal != null && reserveVal !== '' && !isNaN(Number(reserveVal))) ? String(Number(reserveVal)) : '';
    var html = '';
    if (isEditMode) {
        html += '<div class="form-group"><label class="fiber-ws-label object-card-label" for="editHostReserveM">Запас кабеля в узле, м</label>';
        html += '<input type="number" id="editHostReserveM" class="form-input" min="0" step="0.1" value="' + escapeHtml(reserveStr) + '" placeholder="0">';
        html += '<p class="form-hint" style="margin-top:6px;">Учитывается в трассе волокна.</p></div>';
    } else if (reserveStr) {
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Запас в узле:</strong> ' + escapeHtml(reserveStr) + ' м</div>';
    }
    return html;
}

function updateCableProduct(cableUniqueId, manufacturer, model) {
    var cable = objects.find(function(obj) {
        return obj.properties &&
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cable) return;
    setCableProductOnObject(cable, manufacturer, model);
    var settings = typeof getEffectiveCableModelFiberSettings === 'function'
        ? getEffectiveCableModelFiberSettings(manufacturer, model)
        : null;
    if (settings && settings.fiberCount && isOpticalCableType(cable.properties.get('cableType'))) {
        updateCableFiberSettings(cableUniqueId, settings.fiberCount, settings.fiberPalette || null).then(function() {
            saveData({ objects: [cable], syncImmediate: true });
            if (currentModalObject === cable) showCableInfo(cable);
            if (typeof showInfo === 'function') showInfo('Тип кабеля сохранён', '');
        });
        return;
    }
    saveData({ objects: [cable], syncImmediate: true });
    if (currentModalObject === cable) showCableInfo(cable);
    if (typeof showInfo === 'function') showInfo('Тип кабеля сохранён', '');
}

function buildCablePreviewCoordsList(sourceObj, waypoints, targetCoords) {
    waypoints = waypoints || [];
    var sourceCoords = sourceObj.geometry.getCoordinates();
    var allCoords = [sourceCoords];
    for (var wi = 0; wi < waypoints.length; wi++) {
        var w = waypoints[wi];
        if (w && w.geometry) allCoords.push(w.geometry.getCoordinates());
        if (cableUndergroundActive && cableUndergroundManhole && w === cableUndergroundManhole) {
            for (var ui = 0; ui < cableUndergroundCoords.length; ui++) {
                allCoords.push(cableUndergroundCoords[ui]);
            }
        }
    }
    allCoords.push(targetCoords);
    return allCoords;
}

function updateCablePreview(sourceObj, waypoints, targetCoords) {
    if (!sourceObj || !sourceObj.geometry) {
        return;
    }
    waypoints = waypoints || [];
    const allCoords = buildCablePreviewCoordsList(sourceObj, waypoints, targetCoords);
    const sourceCoords = sourceObj.geometry.getCoordinates();
    var last = allCoords[allCoords.length - 1];
    if (sourceCoords[0] === last[0] && sourceCoords[1] === last[1] && waypointCoords.length === 0) {
        const zoom = myMap.getZoom();
        const offset = zoom < 12 ? 0.0001 : (zoom < 15 ? 0.00005 : 0.00002);
        allCoords[allCoords.length - 1] = [sourceCoords[0] + offset, sourceCoords[1] + offset];
    }
    const cableType = getEffectiveCableLayingType();
    const cableWidth = getCableWidth(cableType);
    var previewColor = cableUndergroundActive ? (window.CableUnderground ? CableUnderground.UNDERGROUND_COLOR : '#dc2626') : '#3b82f6';
    var previewDash = cableUndergroundActive ? '10 6' : '12 6';
    if (cablePreviewLine) {
        cablePreviewLine.geometry.setCoordinates(allCoords);
        cablePreviewLine.options.set({
            strokeColor: previewColor,
            strokeWidth: Math.max(cableWidth, 5),
            strokeOpacity: 0.9,
            strokeStyle: previewDash
        });
    } else {
        cablePreviewLine = new ymaps.Polyline(allCoords, {}, {
            strokeColor: previewColor,
            strokeWidth: Math.max(cableWidth, 5),
            strokeOpacity: 0.9,
            strokeStyle: previewDash,
            zIndex: 1000,
            interactive: false
        });
        myMap.geoObjects.add(cablePreviewLine);
    }
}

function removeCablePreview() {
    if (cablePreviewLine) {
        myMap.geoObjects.remove(cablePreviewLine);
        cablePreviewLine = null;
    }
    
    if (hoveredObject) {
        clearHoverHighlight();
    }
}


var STATS_ICON_CONFIG = {
    networkNode: { type: 'node', nodeKind: 'network' },
    aggregationNode: { type: 'node', nodeKind: 'aggregation' },
    switch: { type: 'switch' },
    support: { type: 'support' },
    attachment: { type: 'attachment' },
    manhole: { type: 'manhole' },
    signalPost: { type: 'signalPost' },
    sleeve: { type: 'sleeve' },
    spliceCassette: { type: 'spliceCassette' },
    cross: { type: 'cross' },
    olt: { type: 'olt' },
    splitter: { type: 'splitter' },
    onu: { type: 'onu' },
    camera: { type: 'camera', cameraOnline: true },
    mediaConverter: { type: 'mediaConverter' },
    radioBridge: { type: 'radioBridge' }
};

var STATS_CABLE_ICON_SVG = {
    cableOptical: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>',
    cableCopper: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7c4 0 4 3 8 3s4-3 8-3"></path><path d="M4 12c4 0 4 3 8 3s4-3 8-3"></path><path d="M4 17c4 0 4 3 8 3s4-3 8-3"></path></svg>'
};

function initStatsIcons() {
    if (window._statsIconsInited) return;
    window._statsIconsInited = true;
    document.querySelectorAll('.stat-item[data-stat-key]').forEach(function(item) {
        var key = item.getAttribute('data-stat-key');
        var iconEl = item.querySelector('.stat-icon');
        if (!iconEl || iconEl.innerHTML.trim()) return;
        if (STATS_CABLE_ICON_SVG[key]) {
            iconEl.innerHTML = STATS_CABLE_ICON_SVG[key];
            return;
        }
        var cfg = STATS_ICON_CONFIG[key];
        if (!cfg || !window.MapIcons) return;
        var opts = { variant: 'normal' };
        if (cfg.nodeKind) opts.nodeKind = cfg.nodeKind;
        if (cfg.cameraOnline != null) opts.cameraOnline = cfg.cameraOnline;
        iconEl.innerHTML = MapIcons.buildIconSvg(cfg.type, opts);
    });
}

function setStatCount(el, value) {
    if (!el) return;
    var n = Number(value) || 0;
    el.textContent = String(n);
    var item = el.closest('.stat-item');
    if (item) item.classList.toggle('stat-item--empty', n === 0);
}

function setStatsGroupSum(elId, value) {
    var el = document.getElementById(elId);
    if (!el) return;
    var n = Number(value) || 0;
    el.textContent = String(n);
    var group = el.closest('.stats-group');
    if (group) group.classList.toggle('stats-group--empty', n === 0);
}

function updateStats() {
    initStatsIcons();
    var networkNodeCount = 0;
    var aggregationNodeCount = 0;
    var supportCount = 0;
    var attachmentCount = 0;
    var manholeCount = 0;
    var signalPostCount = 0;
    var cabinetCount = 0;
    var sleeveCount = 0;
    var spliceCassetteCount = 0;
    var crossCount = 0;
    var oltCount = 0;
    var splitterCount = 0;
    var onuCount = 0;
    var cameraCount = 0;
    var mediaConverterCount = 0;
    var radioBridgeCount = 0;
    var switchCount = 0;
    var cableOpticalCount = 0;
    var cableCopperCount = 0;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'node') {
            if ((obj.properties.get('nodeKind') || 'network') === 'aggregation') aggregationNodeCount++;
            else networkNodeCount++;
            switchCount += getNodeAttachedSwitches(obj).length;
        } else if (type === 'support') supportCount++;
        else if (type === 'attachment') attachmentCount++;
        else if (type === 'manhole') manholeCount++;
        else if (type === 'signalPost') signalPostCount++;
        else if (type === 'cabinet') cabinetCount++;
        else if (type === 'sleeve') {
            sleeveCount++;
            if (window.EmbeddedSplitters) splitterCount += EmbeddedSplitters.getList(obj).length;
        } else if (type === 'spliceCassette') {
            spliceCassetteCount++;
            if (window.EmbeddedSplitters) splitterCount += EmbeddedSplitters.getList(obj).length;
        } else if (type === 'cross') {
            crossCount++;
            if (window.EmbeddedSplitters) splitterCount += EmbeddedSplitters.getList(obj).length;
        } else if (type === 'olt') oltCount++;
        else if (type === 'splitter') splitterCount++;
        else if (type === 'onu') onuCount++;
        else if (type === 'camera') cameraCount++;
        else if (type === 'mediaConverter') mediaConverterCount++;
        else if (type === 'radioBridge') radioBridgeCount++;
        else if (type === 'switch') switchCount++;
        else if (type === 'cable') {
            if (typeof isCopperCableType === 'function' && isCopperCableType(obj.properties.get('cableType'))) {
                cableCopperCount++;
            } else {
                cableOpticalCount++;
            }
        }
    });

    setStatCount(document.getElementById('networkNodeCount'), networkNodeCount);
    setStatCount(document.getElementById('aggregationNodeCount'), aggregationNodeCount);
    setStatCount(document.getElementById('switchCount'), switchCount);
    setStatCount(document.getElementById('supportCount'), supportCount);
    setStatCount(document.getElementById('attachmentCount'), attachmentCount);
    setStatCount(document.getElementById('manholeCount'), manholeCount);
    setStatCount(document.getElementById('signalPostCount'), signalPostCount);
    setStatCount(document.getElementById('cabinetCount'), cabinetCount);
    setStatCount(document.getElementById('sleeveCount'), sleeveCount);
    setStatCount(document.getElementById('spliceCassetteCount'), spliceCassetteCount);
    setStatCount(document.getElementById('crossCount'), crossCount);
    setStatCount(document.getElementById('oltCount'), oltCount);
    setStatCount(document.getElementById('splitterCount'), splitterCount);
    setStatCount(document.getElementById('onuCount'), onuCount);
    setStatCount(document.getElementById('cameraCount'), cameraCount);
    setStatCount(document.getElementById('mediaConverterCount'), mediaConverterCount);
    setStatCount(document.getElementById('radioBridgeCount'), radioBridgeCount);
    setStatCount(document.getElementById('cableOpticalCount'), cableOpticalCount);
    setStatCount(document.getElementById('cableCopperCount'), cableCopperCount);

    var sumNodes = networkNodeCount + aggregationNodeCount + switchCount;
    var sumInfra = supportCount + attachmentCount + manholeCount + signalPostCount + cabinetCount + sleeveCount + spliceCassetteCount + crossCount;
    var sumGpon = oltCount + splitterCount + onuCount;
    var sumEquip = cameraCount + mediaConverterCount + radioBridgeCount;
    var sumCables = cableOpticalCount + cableCopperCount;

    setStatsGroupSum('statsSumNodes', sumNodes);
    setStatsGroupSum('statsSumInfra', sumInfra);
    setStatsGroupSum('statsSumGpon', sumGpon);
    setStatsGroupSum('statsSumEquip', sumEquip);
    setStatsGroupSum('statsSumCables', sumCables);

    var statsTotalEl = document.getElementById('statsTotal');
    if (statsTotalEl) {
        statsTotalEl.textContent = String(sumNodes + sumInfra + sumGpon + sumEquip + sumCables);
    }
}

function showInfoModalLoadingShell(title) {
    var modal = document.getElementById('infoModal');
    var modalInfo = document.getElementById('modalInfo');
    var titleEl = document.getElementById('modalTitle');
    if (!modal || !modalInfo) return;
    if (titleEl) titleEl.textContent = title || 'Загрузка…';
    modalInfo.innerHTML = '<div class="modal-info-loading" aria-busy="true"><span class="modal-info-loading-spinner" aria-hidden="true"></span></div>';
    modal.style.display = 'flex';
    modal.classList.add('modal--centered');
}

function deferHeavyModalWork(fn) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            requestAnimationFrame(fn);
        });
    } else {
        setTimeout(fn, 0);
    }
}

function showObjectInfo(obj) {
    if (objectPlacementMode) return;
    if (obj && obj._embedded && obj._host && obj.properties && obj.properties.get('type') === 'splitter') {
        showObjectInfo(obj._host);
        return;
    }
    if (radioBridgeRoutingMode && radioBridgeRoutingData && obj) {
        var rbTypeEarly = obj.properties ? obj.properties.get('type') : null;
        if (typeof handleRadioBridgeRoutingPlacemarkClick === 'function' &&
            handleRadioBridgeRoutingPlacemarkClick(obj, rbTypeEarly)) {
            return;
        }
    }
    var objType = obj && obj.properties ? obj.properties.get('type') : '';
    if (['node', 'olt', 'onu', 'camera', 'mediaConverter', 'radioBridge'].indexOf(objType) !== -1) {
        if (typeof populateDeviceDatalists === 'function') populateDeviceDatalists();
        if (objType !== 'node') {
            var mfr = obj.properties.get('manufacturer') || '';
            if (typeof populateModelDatalistForManufacturer === 'function') {
                var cat = 'node';
                if (objType === 'camera') cat = 'camera';
                else if (objType === 'mediaConverter') cat = 'node';
                else if (objType === 'radioBridge') cat = 'radioBridge';
                else if (objType === 'olt') cat = 'olt';
                else if (objType === 'onu') cat = 'onu';
                populateModelDatalistForManufacturer(mfr, 'deviceModelsList', cat);
            }
        }
    }
    if (splitterFiberRoutingMode && splitterFiberRoutingData) {
        var objId = getObjectUniqueId(obj);
        if (!isGponFiberRoutingParticipant(splitterFiberRoutingData, objId)) {
            cancelSplitterFiberRouting();
        }
    }
    
    if (fiberRoutingMode && fiberRoutingData) {
        var objId = getObjectUniqueId(obj);
        var isSourceOrTarget = (objId === getObjectUniqueId(fiberRoutingData.sleeveObj)) ||
                               (objId === fiberRoutingData.targetId);
        if (!isSourceOrTarget) {
            cancelFiberRouting();
        }
    }

    showInfoModalLoadingShell('Загрузка…');
    applyModalEditModeForObject(obj, function() {
        deferHeavyModalWork(function() {
            showObjectInfoBody(obj);
        });
    });
}

function canShowObjectGallery(obj) {
    if (!obj || !obj.properties) return false;
    var t = obj.properties.get('type');
    return !!(t && t !== 'cable' && t !== 'cableLabel' && t !== 'camera');
}

function buildObjectGallerySectionHtml(obj, isEditMode, opts) {
    if (!canShowObjectGallery(obj)) return '';
    if (window.ObjectGallery && ObjectGallery.canHaveGallery(obj)) {
        return ObjectGallery.buildGallerySectionHtml(obj, isEditMode, opts);
    }
    return '<section class="object-card-section object-card-section--gallery object-gallery-section object-gallery-section--loading" data-object-gallery-mount aria-busy="true">' +
        '<details class="object-gallery-details"><summary class="object-gallery-summary">' +
        '<span class="object-gallery-summary-title">Фотогалерея</span>' +
        '<span class="object-gallery-summary-meta">Загрузка…</span></summary></details></section>';
}

function mountObjectGalleryInModal(modalInfo, obj) {
    if (!modalInfo || !obj || !window.ObjectGallery || !ObjectGallery.canHaveGallery(obj)) return;
    var isEdit = typeof modalIsEditMode === 'function' ? modalIsEditMode() : false;
    var objType = obj.properties && obj.properties.get('type');
    var galleryOpts = (isFiberHostType(objType)) ? { compact: true } : undefined;
    var html = ObjectGallery.buildGallerySectionHtml(obj, isEdit, galleryOpts);
    if (!html) {
        modalInfo.querySelectorAll('[data-object-gallery-mount], [data-object-gallery]').forEach(function(el) { el.remove(); });
        return;
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var section = tmp.firstElementChild;
    if (!section) return;
    var mount = modalInfo.querySelector('[data-object-gallery-mount]');
    var existing = modalInfo.querySelector('[data-object-gallery]:not([data-object-gallery-mount])');
    if (mount) {
        mount.replaceWith(section);
        modalInfo.querySelectorAll('[data-object-gallery-mount]').forEach(function(el) { el.remove(); });
    } else if (existing) {
        existing.replaceWith(section);
    }
}

function bindObjectGalleryModal(modalInfo, obj) {
    if (!modalInfo || !obj || !canShowObjectGallery(obj)) return;
    if (!window.ObjectGallery) {
        if (typeof loadAppScript === 'function') {
            loadAppScript('js/ui/object-gallery.js').then(function() {
                mountObjectGalleryInModal(modalInfo, obj);
                bindObjectGalleryModal(modalInfo, obj);
            }).catch(function() {});
        }
        return;
    }
    if (!ObjectGallery.canHaveGallery(obj)) return;
    mountObjectGalleryInModal(modalInfo, obj);
    ObjectGallery.initGallery(modalInfo, obj, {
        isEditMode: modalIsEditMode(),
        getObj: function() { return currentModalObject; },
        onChanged: function() { saveData(); }
    });
}

function showObjectInfoBody(obj) {
    if (!isObjectOnMap(obj)) return;
    currentModalObject = obj;
    const type = obj.properties.get('type');
    const name = obj.properties.get('name') || '';
    const cableSourceObj = (obj._embedded && obj._host) ? obj._host : obj;

    const connectedCables = getConnectedCables(cableSourceObj);

    let title = '';
    if (type === 'node') {
        title = name ? `Узел сети: ${name}` : 'Узел сети';
    } else if (type === 'sleeve') {
        title = name ? `Кабельная муфта: ${name}` : 'Кабельная муфта';
    } else if (type === 'spliceCassette') {
        title = name ? `Сплайс-кассета: ${name}` : 'Сплайс-кассета';
    } else if (type === 'cross') {
        title = name ? `Оптический кросс: ${name}` : 'Оптический кросс';
    } else if (type === 'olt') {
        title = name ? `OLT: ${name}` : 'OLT (GPON)';
    } else if (type === 'splitter') {
        title = name ? `Сплиттер: ${name}` : 'Сплиттер';
    } else if (type === 'onu') {
        title = name ? `ONU: ${name}` : 'ONU';
    } else if (type === 'camera') {
        title = name ? `Камера: ${name}` : 'Камера';
    } else if (type === 'mediaConverter') {
        title = name ? `Медиаконвертер: ${name}` : 'Медиаконвертер';
    } else if (type === 'radioBridge') {
        title = name ? `Wi‑Fi радиомост: ${name}` : 'Wi‑Fi радиомост';
    } else {
        title = 'Объект';
    }
    
    document.getElementById('modalTitle').textContent = title;

    const fiberUsesWorkspace = isFiberHostType(type) && connectedCables.length >= 1;
    updateInfoModalChrome(type, name, { fiberWorkspace: fiberUsesWorkspace });

    let html = '';

    if (obj._embedded && obj._host) {
        var hostType = obj._host.properties.get('type');
        var hostLabel = isCrossLikeHostType(hostType) ? 'кроссу' : (hostType === 'spliceCassette' ? 'сплайс-кассете' : 'муфте');
        html += '<div style="margin-bottom: 12px;"><button type="button" id="back-to-host-from-splitter" class="btn-secondary" style="width:100%;">← Назад к ' + hostLabel + '</button></div>';
    }

    if (type === 'olt') {
        html += buildOltCardContent(obj, modalIsEditMode(), name);
    }

    if (type === 'splitter') {
        const splitRatio = parseInt(obj.properties.get('splitRatio'), 10) || 8;
        const inputFiber = obj.properties.get('inputFiber') || null;
        const outputConnections = obj.properties.get('outputConnections') || [];
        const splitterCables = getConnectedCables(cableSourceObj);
        const splitterFiberOptions = [];
        splitterCables.forEach(function(cable) {
            const cid = cable.properties.get('uniqueId') || ('cable-' + Date.now());
            if (!cable.properties.get('uniqueId')) cable.properties.set('uniqueId', cid);
            const cableName = cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'));
            const n = getFiberCount(cable);
            for (var fi = 1; fi <= n; fi++) {
                splitterFiberOptions.push({ cableId: cid, fiberNumber: fi, label: cableName + ', жила ' + fi, value: cid + '-' + fi });
            }
        });
        if (inputFiber && inputFiber.cableId && !splitterFiberOptions.some(function(o) { return o.value === (inputFiber.cableId + '-' + inputFiber.fiberNumber); })) {
            var inputCable = objects.find(function(c) { return c.properties && c.properties.get('type') === 'cable' && getObjectUniqueId(c) === inputFiber.cableId; });
            if (inputCable) {
                var cid = getObjectUniqueId(inputCable);
                var cableName = inputCable.properties.get('cableName') || getCableDescription(inputCable.properties.get('cableType'));
                var n = getFiberCount(inputCable);
                for (var fi = 1; fi <= n; fi++) {
                    splitterFiberOptions.push({ cableId: cid, fiberNumber: fi, label: cableName + ', жила ' + fi + ' (вход)', value: cid + '-' + fi });
                }
            }
        }
        syncSplitterInputFromHost(obj);
        var effectiveInputFiber = getSplitterRootInputFiber(obj) || null;
        var outputsPadded = (outputConnections || []).slice();
        while (outputsPadded.length < splitRatio) outputsPadded.push(null);
        if (outputsPadded.length > splitRatio) outputsPadded = outputsPadded.slice(0, splitRatio);
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Сплиттер</h4>';
        if (modalIsEditMode()) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editSplitterName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название сплиттера</label>';
            html += '<input type="text" id="editSplitterName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Введите название сплиттера">';
            html += '</div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Название:</strong> ' + escapeHtml(name) + '</div>';
        }
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem;">Коэффициент деления: 1:' + splitRatio + '</div>';
        if (effectiveInputFiber) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 6px;"><strong>Входная жила:</strong> кабель ' + escapeHtml(String(effectiveInputFiber.cableId).substring(0, 12)) + '…, жила ' + effectiveInputFiber.fiberNumber + '</div>';
        html += '</div>';
        if (modalIsEditMode()) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Вход и выходы</h4>';
            if (effectiveInputFiber) {
                html += '<div style="margin-bottom: 12px;"><span style="font-size: 0.8125rem; color: var(--text-secondary);">Входная жила задаётся с муфты/кросса (кнопка «Сплиттер» у жилы).</span>';
                html += '<div style="font-size: 0.875rem; color: var(--text-primary); margin-top: 4px;">' + escapeHtml(String(effectiveInputFiber.cableId).substring(0, 12)) + '…, жила ' + effectiveInputFiber.fiberNumber + '</div></div>';
            } else {
                html += '<div style="margin-bottom: 12px; font-size: 0.8125rem; color: var(--text-secondary);">Вход не задан. Подключите жилу с муфты или кросса — кнопка «Сплиттер» у нужной жилы.</div>';
            }
            if (effectiveInputFiber) {
                var mapSplitterHostIn = getSplitterHostInputFiber(obj);
                var mapSplitterCanOlt = mapSplitterHostIn && mapSplitterHostIn.hostObj &&
                    isFiberReachableToOlt(mapSplitterHostIn.hostObj, effectiveInputFiber.cableId, effectiveInputFiber.fiberNumber);
                html += '<div style="margin-bottom: 8px; font-size: 0.8125rem; color: var(--text-secondary);">Одна жила делится на ' + splitRatio + ' — для каждого выхода направьте жилу в муфту/кросс (продолжение сети)' +
                    (mapSplitterCanOlt ? ', на ONU (GPON)' : '') + ' или на следующий сплиттер.</div>';
                html += '<div id="splitterOutputsList">';
                for (var oi = 0; oi < splitRatio; oi++) {
                    var out = outputsPadded[oi] || null;
                    var destLabel = '';
                    var hasCompleteConnection = false;
                    var hasPartialRouting = false;
                    if (out) {
                        var routeInfo = '';
                        var routeLen = (out.routeIds && out.routeIds.length) || (out.route && out.route.length) || 0;
                        if (routeLen > 0) {
                            routeInfo = ' (' + routeLen + ' точ.)';
                        }
                        if (out.onuId) {
                            var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out.onuId; });
                            destLabel = onuObj ? '→ ONU ' + escapeHtml(onuObj.properties.get('name') || 'ONU') + routeInfo : '';
                            hasCompleteConnection = true;
                        } else if (out.mediaConverterId) {
                            var mcObjMap = objects.find(function(o) { return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === out.mediaConverterId; });
                            destLabel = mcObjMap ? '→ МК ' + escapeHtml(mcObjMap.properties.get('name') || 'МК') + routeInfo : '';
                            hasCompleteConnection = true;
                        } else if (out.nodeId) {
                            var nodeObjMap = objects.find(function(o) { return o.properties && o.properties.get('type') === 'node' && getObjectUniqueId(o) === out.nodeId; });
                            var nodeLblMap = nodeObjMap ? (nodeObjMap.properties.get('name') || 'Узел') : 'Узел';
                            destLabel = '→ ' + escapeHtml(nodeLblMap) + (out.switchPort != null ? ' · SFP ' + out.switchPort : '') + routeInfo;
                            hasCompleteConnection = true;
                        } else if (out.splitterId) {
                            var spObj = resolveSplitterObject(out.splitterId);
                            destLabel = spObj ? '→ Сплиттер ' + escapeHtml(spObj.properties.get('name') || '') + routeInfo : '';
                            hasCompleteConnection = true;
                        } else if (out.crossPort != null) {
                            destLabel = '→ порт кросса ' + parseInt(out.crossPort, 10) + routeInfo;
                            hasPartialRouting = true;
                        } else if (out.hostId && out.cableId && out.fiberNumber != null) {
                            var hostOut = getFiberHostByUid(out.hostId);
                            var hostOutName = hostOut ? (hostOut.properties.get('name') || (isCrossLikeHostType(hostOut.properties.get('type')) ? 'Кросс' : 'Муфта')) : 'Муфта/кросс';
                            destLabel = '→ ' + escapeHtml(hostOutName) + ', ж.' + out.fiberNumber + routeInfo;
                            hasPartialRouting = true;
                        }
                        if (!hasCompleteConnection && typeof splitterOutputHasEndpoint === 'function' && splitterOutputHasEndpoint(out)) {
                            hasCompleteConnection = true;
                            if (!destLabel) destLabel = '→ подключено' + routeInfo;
                        }
                    }
                    var canOfferHost = !out || (!out.splitterId && !out.hostId && out.crossPort == null && !hasCompleteConnection);
                    var canOfferOnu = mapSplitterCanOlt && (!out || (!out.onuId && !out.mediaConverterId && !hasCompleteConnection));
                    var canOfferChildSplitter = !out || (!out.splitterId && !(out.hostId && out.cableId && out.fiberNumber != null) && out.crossPort == null && !hasCompleteConnection);
                    html += '<div class="splitter-output-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">';
                    html += '<span style="min-width: 72px; font-size: 0.8125rem; color: var(--text-primary);">Выход ' + (oi + 1) + '</span>';
                    var outLabelVal = typeof getSplitterOutputLabel === 'function'
                        ? getSplitterOutputLabel(getObjectUniqueId(obj), oi, null) : '';
                    if (modalIsEditMode()) {
                        html += '<input type="text" class="map-splitter-output-label-input form-input" data-output-index="' + oi + '" value="' + escapeHtml(outLabelVal) + '" placeholder="Подпись выхода…" title="Подпись выхода сплиттера" style="flex: 1; min-width: 120px;">';
                    } else if (outLabelVal) {
                        html += '<span style="font-size: 0.8rem; color: var(--text-secondary);">📝 ' + escapeHtml(outLabelVal) + '</span>';
                    }
                    if (hasCompleteConnection) {
                        html += '<span style="font-size: 0.8rem; color: var(--text-secondary); padding: 4px 8px; background: var(--bg-tertiary); border-radius: 4px;">' + destLabel + '</span>';
                        html += '<button type="button" class="btn-splitter-output-delete" data-output-index="' + oi + '" title="Удалить соединение" style="padding: 4px 8px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">✕</button>';
                    } else {
                        if (hasPartialRouting && destLabel) {
                            html += '<span style="font-size: 0.8rem; color: var(--text-secondary); padding: 4px 8px; background: var(--bg-tertiary); border-radius: 4px;">' + destLabel + '</span>';
                        }
                        if (canOfferHost) {
                            html += '<button type="button" class="btn-splitter-output-to-host" data-output-index="' + oi + '" title="Пустить в муфту или кросс" style="padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">🔴 Муфта</button>';
                        }
                        if (canOfferOnu) {
                            html += '<button type="button" class="btn-splitter-output-to-onu" data-output-index="' + oi + '" title="GPON на ONU" style="padding: 4px 8px; background: #a855f7; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">📡 ONU</button>';
                        }
                        if (canOfferChildSplitter) {
                            html += '<button type="button" class="btn-splitter-output-to-splitter" data-output-index="' + oi + '" title="Пустить на сплиттер" style="padding: 4px 8px; background: #f97316; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">🔀 Сплиттер</button>';
                        }
                        if (hasPartialRouting) {
                            html += '<button type="button" class="btn-splitter-output-delete" data-output-index="' + oi + '" title="Удалить соединение" style="padding: 4px 8px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">✕</button>';
                        }
                    }
                    html += '</div>';
                }
                html += '</div>';
            } else {
                html += '<div style="padding: 12px; background: #fef3c7; border-radius: 6px; border: 1px solid #fde68a; color: #92400e; font-size: 0.8125rem;">⚠️ Сначала подключите входную жилу к сплиттеру с муфты или кросса, чтобы настроить выходы.</div>';
            }
            html += '</div>';
        }
    }

    if (type === 'onu') {
        const onuIncoming = obj.properties.get('incomingFiber') || null;
        const manufacturer = obj.properties.get('manufacturer') || '';
        const model = obj.properties.get('model') || '';
        const comment = obj.properties.get('comment') || '';
        const ipAddress = (obj.properties.get('ipAddress') || '').trim();
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">ONU</h4>';
        if (modalIsEditMode()) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editOnuName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название ONU</label>';
            html += '<input type="text" id="editOnuName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Введите название ONU">';
            html += '</div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Производитель</label><div class="device-combobox" data-catalog="onu" data-type="manufacturer" data-value-id="editOnuManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editOnuManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Модель</label><div class="device-combobox" data-catalog="onu" data-type="model" data-value-id="editOnuModel" data-manufacturer-id="editOnuManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editOnuModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += buildEquipmentIpAddressEditFieldHtml('editOnuIpAddress', ipAddress, 'object-card-label');
            html += '<div class="form-group"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Комментарий</label>';
            html += '<textarea id="editOnuComment" class="form-input" rows="2" placeholder="Дополнительные сведения">' + escapeHtml(comment) + '</textarea></div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;">Название: ' + escapeHtml(name) + '</div>';
        }
        if (manufacturer || model) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">Устройство: ' + escapeHtml([manufacturer, model].filter(Boolean).join(' ') || '—') + '</div>';
        if (ipAddress) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">IP: ' + escapeHtml(ipAddress) + '</div>';
        if (comment) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; white-space: pre-wrap; margin-top: 6px;">' + escapeHtml(comment) + '</div>';
        if (onuIncoming) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 6px;">Подключена жила: кабель ' + escapeHtml(String(onuIncoming.cableId).substring(0, 12)) + '…, жила ' + onuIncoming.fiberNumber + '</div>';
        html += '</div>';
    }

    if (type === 'camera') {
        html += buildCameraCardContent(obj, modalIsEditMode(), name);
    }

    if (type === 'mediaConverter') {
        const manufacturerMc = obj.properties.get('manufacturer') || '';
        const modelMc = obj.properties.get('model') || '';
        const commentMc = obj.properties.get('comment') || '';
        const ipAddressMc = (obj.properties.get('ipAddress') || '').trim();
        const mcIncoming = obj.properties.get('incomingFiber') || null;
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Медиаконвертер</h4>';
        html += '<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 12px;">Оптический медиаконвертер на карте. Медный кабель к коммутатору — кнопка ниже (доступна после подключения оптической жилы с муфты или кросса). Волокно — кнопка «⇄ МК» у жилы в карточке муфты или кросса.</p>';
        if (modalIsEditMode()) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editMediaConverterName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название</label>';
            html += '<input type="text" id="editMediaConverterName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название медиаконвертера">';
            html += '</div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Производитель</label><div class="device-combobox" data-catalog="node" data-type="manufacturer" data-value-id="editMediaConverterManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturerMc ? escapeHtml(manufacturerMc) : 'Выберите производителя') + '</button><input type="hidden" id="editMediaConverterManufacturer" value="' + escapeHtml(manufacturerMc) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Модель</label><div class="device-combobox" data-catalog="node" data-type="model" data-value-id="editMediaConverterModel" data-manufacturer-id="editMediaConverterManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (modelMc ? escapeHtml(modelMc) : 'Выберите модель') + '</button><input type="hidden" id="editMediaConverterModel" value="' + escapeHtml(modelMc) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += buildEquipmentIpAddressEditFieldHtml('editMediaConverterIpAddress', ipAddressMc, 'object-card-label');
            html += '<div class="form-group"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Комментарий</label>';
            html += '<textarea id="editMediaConverterComment" class="form-input" rows="2" placeholder="Дополнительные сведения">' + escapeHtml(commentMc) + '</textarea></div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;">Название: ' + escapeHtml(name) + '</div>';
        }
        if (manufacturerMc || modelMc) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">Устройство: ' + escapeHtml([manufacturerMc, modelMc].filter(Boolean).join(' ') || '—') + '</div>';
        if (ipAddressMc) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">IP: ' + escapeHtml(ipAddressMc) + '</div>';
        if (commentMc) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; white-space: pre-wrap; margin-top: 6px;">' + escapeHtml(commentMc) + '</div>';
        if (mcIncoming) {
            const cMc = objects.find(function(c) {
                return c.properties && c.properties.get('type') === 'cable' && (c.properties.get('uniqueId') || '') === mcIncoming.cableId;
            });
            const mcDesc = cMc ? (cMc.properties.get('cableName') || getCableDescription(cMc.properties.get('cableType'))) : String(mcIncoming.cableId).substring(0, 12) + '…';
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Входная жила (от муфты/кросса): ' + escapeHtml(mcDesc) + ', жила ' + mcIncoming.fiberNumber + '</div>';
        }
        if (modalIsEditMode() && mcIncoming && mcIncoming.cableId && !cameraHasCopperCable(obj)) {
            html += '<div style="margin-top: 16px; padding: 14px; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%); border-radius: 10px; border: 2px solid #0f766e; box-shadow: 0 4px 14px rgba(20, 184, 166, 0.45);">';
            html += '<div style="font-size: 0.8125rem; color: #ecfdf5; margin-bottom: 10px; font-weight: 600;">Медный кабель к коммутатору или камере</div>';
            html += '<button type="button" class="btn-copper-connect-from-media-converter" style="width: 100%; padding: 12px 16px; font-size: 0.9375rem; font-weight: 700; color: #0f172a; background: #f0fdfa; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.12);">🔌 Начать прокладку медного кабеля</button>';
            html += '</div>';
        }
        html += '</div>';
    }

    if (type === 'radioBridge' && typeof buildRadioBridgeCardContent === 'function') {
        html += buildRadioBridgeCardContent(obj, modalIsEditMode(), name);
    }

    if (type === 'sleeve' && !fiberUsesWorkspace) {
        html += buildSleeveCardContent(obj, modalIsEditMode(), name);
    }

    if (type === 'spliceCassette' && !fiberUsesWorkspace) {
        html += buildSpliceCassetteCardContent(obj, modalIsEditMode(), name, connectedCables);
    }

    if (type === 'node') {
        html += buildNodeCardContent(obj, modalIsEditMode(), name);
    }

    if (type === 'cross' && !fiberUsesWorkspace) {
        html += buildCrossCardContent(obj, modalIsEditMode(), name);
    }

    if (type !== 'node' && type !== 'olt' && type !== 'camera' && type !== 'radioBridge') {
        if (['splitter', 'onu', 'mediaConverter', 'switch'].indexOf(type) !== -1) {
            html += buildObjectCoordsSectionHtml(obj);
        }
        var galleryOpts = fiberUsesWorkspace ? { compact: true } : undefined;
        html += buildObjectGallerySectionHtml(obj, modalIsEditMode(), galleryOpts);
    }

    if (modalIsEditMode() && !fiberUsesWorkspace && type !== 'node' && type !== 'olt') {
        html += typeof buildObjectCardActionsHtml === 'function'
            ? buildObjectCardActionsHtml('device-card-actions')
            : '<div class="object-actions-section device-card-actions">' +
                '<button type="button" id="saveChangesBtn" class="btn-primary node-card-save-btn">Сохранить</button>' +
                '<button type="button" id="duplicateCurrentObject" class="btn-secondary">Дублировать</button>' +
                '<button type="button" id="deleteCurrentObject" class="btn-danger">Удалить</button>' +
                '</div>';
    }

    if (type !== 'camera' && type !== 'olt' && type !== 'node' && type !== 'radioBridge' && !(type === 'splitter' && obj._embedded) &&
        !(type === 'spliceCassette' && !fiberUsesWorkspace) &&
        !(type === 'sleeve' && !fiberUsesWorkspace) &&
        !(type === 'cross' && !fiberUsesWorkspace)) {
    if (connectedCables.length === 0) {
        const noCablesText = 'К этому объекту не подключено кабелей';
        html += '<div class="no-cables" style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.875rem;">' + noCablesText + '</div>';
    } else {
        
        if ((isFiberHostType(type)) && connectedCables.length >= 1) {
            html += renderFiberConnectionsVisualization(obj, connectedCables);
        } else {
            
            connectedCables.forEach((cable, index) => {
                const cableType = cable.properties.get('cableType');
                const cableDescription = getCableDescription(cableType, cable);
                const fibers = getFiberColors(cable);
                const cableFiberN = getFiberCount(cable);
                
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
                                ${modalIsEditMode() ? (cableType === 'copper' ? `<span class="cable-type-label-muted">${escapeHtml(cableDescription)}</span>` : `<span class="cable-actions-toolbar"><input type="number" class="cable-fiber-count-input form-input" data-cable-id="${cableUniqueId}" min="1" max="96" value="${cableFiberN}" title="Число жил" aria-label="Число жил"><button type="button" class="btn-secondary btn-cable-palette-edit" data-cable-id="${cableUniqueId}" title="Цвета жил">${window.FiberCableConfig && window.FiberCableConfig.cablePaletteButtonHtml ? window.FiberCableConfig.cablePaletteButtonHtml() : 'Цвета'}</button></span>`) : `<span class="cable-type-label-muted">${escapeHtml(cableDescription)}</span>`}
                                ${modalIsEditMode() ? `<button type="button" class="btn-delete-cable btn-delete-cable--toolbar" data-action="delete-cable" data-cable-id="${cableUniqueId}" title="Удалить кабель" aria-label="Удалить кабель"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
                            </div>
                        </div>
                        <div class="fibers-list">
                `;

                const usedFibers = getUsedFibers(obj, cableUniqueId);
                
                fibers.forEach((fiber, fiberIndex) => {
                    const isUsed = usedFibers.includes(fiber.number);
                    html += `
                        <div class="fiber-item ${isUsed ? 'fiber-used' : 'fiber-free'}" 
                             data-cable-id="${cableUniqueId}" 
                             data-fiber-number="${fiber.number}">
                            <div class="fiber-item-content">
                                <div class="fiber-color" style="background-color: ${fiber.color}; ${isUsed ? 'opacity: 0.5; border: 2px dashed #dc2626;' : (fiber.hasBlackRing ? 'border: 2px solid #000;' : '')}"></div>
                                <span class="fiber-label">Жила ${fiber.number}: ${fiber.name} ${isUsed ? '<span class="fiber-status">(используется)</span>' : '<span class="fiber-status fiber-free-text">(свободна)</span>'}</span>
                            </div>
                            ${!isUsed && modalIsEditMode() && !isFiberHostType(type) && type !== 'olt' && type !== 'splitter' && type !== 'onu' && type !== 'camera' && type !== 'mediaConverter' ? `<button class="btn-continue-cable" data-cable-id="${cableUniqueId}" data-fiber-number="${fiber.number}" title="Продолжить кабель с этой жилой">→</button>` : ''}
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
    }

    document.getElementById('modalInfo').innerHTML = html;

    const modal = document.getElementById('infoModal');
    const modalContent = modal && modal.querySelector('.modal-content');
    if (modalContent) {
        if (fiberUsesWorkspace) modalContent.classList.add('fiber-management-modal');
        else modalContent.classList.remove('fiber-management-modal');
    }
    if (modal) {
        if (fiberUsesWorkspace) {
            modal.classList.add('fiber-management-modal-open');
            modal.classList.toggle('fiber-management-modal-open--edit', modalIsEditMode());
            modal.classList.toggle('fiber-management-modal-open--view', !modalIsEditMode());
        } else {
            modal.classList.remove('fiber-management-modal-open', 'fiber-management-modal-open--edit', 'fiber-management-modal-open--view');
        }
    }
    
    setupModalEventListeners();
    setupEditAndDeleteListeners();
    var modalInfo = document.getElementById('modalInfo');
    if (modalInfo) initDeviceComboboxes(modalInfo);
    if (type === 'camera' && modalInfo) {
        if (modalInfo.querySelector('.trace-show-on-map-btn')) attachTraceShowOnMapHandlers(modalInfo);
        if (window.CameraPlayer) {
            CameraPlayer.initCameraCard(modalInfo, obj, {
                isEditMode: modalIsEditMode(),
                getObj: function() { return currentModalObject; }
            });
        }
    }
    bindObjectGalleryModal(modalInfo, obj);
    modal.style.display = 'flex';
    modal.classList.add('modal--centered');
    updateModalLockBanner(getObjectUniqueId(obj));
    applyObjectLocksToMapDraggable();
    if (typeof window.initPanelPlexusCanvases === 'function') {
        requestAnimationFrame(function () { window.initPanelPlexusCanvases(modal); });
    }

    if (isFiberHostType(type) && fiberUsesWorkspace) {
        pendingFiberSchemeSessionScroll = savedFiberConnectionsScrollPos;
        savedFiberConnectionsScrollPos = null;
    }
}

function applySignalPostNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'signalPost') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Сигнальный столб: ' + trimmed : 'Сигнальный столб');
    updateObjectLabel(currentModalObject, trimmed);
    var lbl = currentModalObject.properties.get('label');
    if (lbl && trimmed) {
        try { myMap.geoObjects.add(lbl); } catch (e) {}
    } else if (lbl && !trimmed) {
        try { myMap.geoObjects.remove(lbl); } catch (e) {}
    }
    saveData();
}

function buildHostCardUsageBarHtml(label, used, max, usageTone, usagePct) {
    if (!(max > 0)) return '';
    var pct = Math.min(100, usagePct != null ? usagePct : 0);
    var html = '<div class="host-card-usage host-card-usage--' + usageTone + '">';
    html += '<div class="host-card-usage-head">';
    html += '<span class="host-card-usage-label">' + escapeHtml(label) + '</span>';
    html += '<span class="host-card-usage-val">' + used + ' / ' + max + '</span>';
    html += '</div>';
    html += '<div class="host-card-usage-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + escapeHtml(label) + '">';
    html += '<div class="host-card-usage-fill" style="width:' + pct + '%"></div>';
    html += '</div></div>';
    return html;
}

function buildSleeveCardContent(obj, isEditMode, name) {
    var storedSleeveType = obj.properties.get('sleeveType');
    var sleeveTypeDisplay = storedSleeveType && typeof findSleeveTypeById === 'function'
        ? (findSleeveTypeById(storedSleeveType) ? findSleeveTypeById(storedSleeveType).label : String(storedSleeveType))
        : (storedSleeveType ? String(storedSleeveType) : 'Не указан');
    var usedFibers = getTotalUsedFibersInSleeve(obj);
    var maxFibers = parseInt(obj.properties.get('maxFibers'), 10) || 0;
    var usagePct = maxFibers > 0 ? Math.round((usedFibers / maxFibers) * 100) : 0;
    var usageTone = (maxFibers > 0 && usedFibers > maxFibers) ? 'over' : (usagePct >= 80 ? 'high' : 'ok');
    var reserveM = obj.properties.get('reserveM');
    var hasReserve = reserveM != null && reserveM !== '' && !isNaN(Number(reserveM)) && Number(reserveM) > 0;

    var html = '<div class="host-card host-card--sleeve">';

    html += '<section class="object-card-section host-card-hero">';
    html += '<div class="host-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="host-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('sleeve', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="host-card-hero-text">';
    html += '<div class="host-card-view-name">' + escapeHtml(name || 'Муфта') + '</div>';
    html += '<div class="host-card-view-meta">';
    html += '<span class="host-kind-pill host-kind-pill--sleeve">Кабельная муфта</span>';
    if (sleeveTypeDisplay && sleeveTypeDisplay !== 'Не указан') {
        html += '<span class="host-card-type-inline">' + escapeHtml(sleeveTypeDisplay) + '</span>';
    }
    html += '</div>';
    if (isEditMode) {
        html += '<p class="object-card-hint host-card-hero-hint">После прокладки ВОЛС откроется схема жил, таблица сращиваний и сплиттеры.</p>';
    }
    html += '</div></div>';

    html += '<dl class="host-card-stats">';
    html += '<div class="host-card-stat"><dt>Тип</dt><dd title="' + escapeHtml(sleeveTypeDisplay) + '">' + escapeHtml(sleeveTypeDisplay) + '</dd></div>';
    html += '<div class="host-card-stat"><dt>Ёмкость</dt><dd>' + (maxFibers > 0 ? maxFibers : '—') + '</dd></div>';
    html += '<div class="host-card-stat"><dt>Кабелей</dt><dd>0</dd></div>';
    if (hasReserve) {
        html += '<div class="host-card-stat"><dt>Запас</dt><dd>' + Number(reserveM) + ' м</dd></div>';
    }
    html += '</dl>';

    html += buildHostCardUsageBarHtml('Волокна', usedFibers, maxFibers, usageTone, usagePct);
    html += '</section>';

    html += buildObjectCoordsSectionHtml(obj);

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Параметры</h4>';
        html += '<div class="form-group"><label for="editSleeveName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editSleeveName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Муфта М-12">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editSleeveType" class="object-card-label">Тип муфты</label>';
        html += '<select id="editSleeveType" class="form-select">' + getSleeveTypeSelectOptionsHtml(storedSleeveType ? String(storedSleeveType) : '') + '</select>';
        html += '</div>';
        html += typeof buildHostReserveMFieldHtml === 'function' ? buildHostReserveMFieldHtml(obj, true) : '';
        html += '</section>';
    }

    html += '<section class="object-card-section object-card-section--fibers">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Подключения</h4>';
    html += '<span class="object-card-badge object-card-badge--sleeve">0 каб.</span>';
    html += '</div>';
    html += '<div class="object-card-callout object-card-callout--info">';
    html += '<p>Кабели не подключены. После прокладки ВОЛС откроется рабочее место со схемой и таблицей сращиваний.</p>';
    html += '</div></section>';

    html += '</div>';
    return html;
}

function buildCrossCardContent(obj, isEditMode, name) {
    var storedCrossType = obj.properties.get('crossType');
    var crossTypeLabel = storedCrossType && typeof getCrossTypeLabel === 'function'
        ? getCrossTypeLabel(storedCrossType)
        : (storedCrossType ? String(storedCrossType) : 'Не указан');
    var crossPorts = Math.max(1, parseInt(obj.properties.get('crossPorts'), 10) || 24);
    var usedPorts = getTotalUsedPortsInCross(obj);
    var usagePct = crossPorts > 0 ? Math.round((usedPorts / crossPorts) * 100) : 0;
    var usageTone = usedPorts > crossPorts ? 'over' : (usagePct >= 80 ? 'high' : 'ok');
    var reserveM = obj.properties.get('reserveM');
    var hasReserve = reserveM != null && reserveM !== '' && !isNaN(Number(reserveM)) && Number(reserveM) > 0;

    var html = '<div class="host-card host-card--cross">';

    html += '<section class="object-card-section host-card-hero">';
    html += '<div class="host-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="host-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('cross', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="host-card-hero-text">';
    html += '<div class="host-card-view-name">' + escapeHtml(name || 'Кросс') + '</div>';
    html += '<div class="host-card-view-meta">';
    html += '<span class="host-kind-pill host-kind-pill--cross">Оптический кросс</span>';
    if (crossTypeLabel && crossTypeLabel !== 'Не указан') {
        html += '<span class="host-card-type-inline">' + escapeHtml(crossTypeLabel) + '</span>';
    }
    html += '</div>';
    if (isEditMode) {
        html += '<p class="object-card-hint host-card-hero-hint">После прокладки ВОЛС откроется схема портов, кроссировка и таблица жил.</p>';
    }
    html += '</div></div>';

    html += '<dl class="host-card-stats">';
    html += '<div class="host-card-stat"><dt>Тип</dt><dd title="' + escapeHtml(crossTypeLabel) + '">' + escapeHtml(crossTypeLabel) + '</dd></div>';
    html += '<div class="host-card-stat"><dt>Порты</dt><dd>' + crossPorts + '</dd></div>';
    html += '<div class="host-card-stat"><dt>Кабелей</dt><dd>0</dd></div>';
    if (hasReserve) {
        html += '<div class="host-card-stat"><dt>Запас</dt><dd>' + Number(reserveM) + ' м</dd></div>';
    }
    html += '</dl>';

    html += buildHostCardUsageBarHtml('Порты', usedPorts, crossPorts, usageTone, usagePct);
    html += '</section>';

    html += buildObjectCoordsSectionHtml(obj);

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Параметры</h4>';
        html += '<div class="form-group"><label for="editCrossName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editCrossName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Кросс КР-1">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editCrossType" class="object-card-label">Тип кросса</label>';
        html += '<select id="editCrossType" class="form-select">' + getCrossTypeSelectOptionsHtml(storedCrossType ? String(storedCrossType) : '') + '</select>';
        html += '</div>';
        html += typeof buildHostReserveMFieldHtml === 'function' ? buildHostReserveMFieldHtml(obj, true) : '';
        html += '</section>';
    }

    html += '<section class="object-card-section object-card-section--fibers">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Подключения</h4>';
    html += '<span class="object-card-badge object-card-badge--cross">0 каб.</span>';
    html += '</div>';
    html += '<div class="object-card-callout object-card-callout--info">';
    html += '<p>Кабели не подключены. После прокладки ВОЛС откроется рабочее место со схемой портов и таблицей жил.</p>';
    html += '</div></section>';

    html += '</div>';
    return html;
}

function buildSpliceCassetteCardContent(obj, isEditMode, name, connectedCables) {
    var storedCassetteType = obj.properties.get('cassetteType') || obj.properties.get('sleeveType');
    var cassetteTypeDisplay = storedCassetteType && typeof getSpliceCassetteTypeLabel === 'function'
        ? getSpliceCassetteTypeLabel(storedCassetteType)
        : (storedCassetteType ? String(storedCassetteType) : 'Не указан');
    var usedFibers = getTotalUsedFibersInSleeve(obj);
    var maxFibers = parseInt(obj.properties.get('maxFibers'), 10) || 0;
    var cableCount = connectedCables ? connectedCables.length : 0;
    var usagePct = maxFibers > 0 ? Math.round((usedFibers / maxFibers) * 100) : 0;
    var usageTone = (maxFibers > 0 && usedFibers > maxFibers) ? 'over' : (usagePct >= 80 ? 'high' : 'ok');

    var cabId = typeof getObjectCabinetId === 'function' ? getObjectCabinetId(obj) : '';
    var cabObj = cabId && typeof getCabinetByUid === 'function' ? getCabinetByUid(cabId) : null;
    var cabName = cabObj && typeof getCabinetDisplayName === 'function' ? getCabinetDisplayName(cabObj) : 'Ящик';

    var html = '<div class="cassette-card">';

    html += '<section class="object-card-section cassette-card-hero">';
    html += '<div class="cassette-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="cassette-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('spliceCassette', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="cassette-card-hero-text">';
    html += '<div class="cassette-card-view-name">' + escapeHtml(name || 'Сплайс-кассета') + '</div>';
    html += '<div class="cassette-card-view-meta">';
    html += '<span class="cassette-kind-pill">Сплайс-кассета</span>';
    if (cassetteTypeDisplay && cassetteTypeDisplay !== 'Не указан') {
        html += '<span class="cassette-card-type-inline">' + escapeHtml(cassetteTypeDisplay) + '</span>';
    }
    html += '</div>';
    if (cabObj) {
        html += '<div class="cassette-card-cabinet">';
        html += '<span class="cassette-card-cabinet-label">Ящик</span>';
        html += '<span class="cassette-card-cabinet-name">' + escapeHtml(cabName) + '</span>';
        html += '</div>';
    }
    if (isEditMode) {
        html += '<p class="object-card-hint cassette-card-hero-hint">Кассета монтируется в ящик. Кабель ВОЛС подключают через ящик на карте или кнопку «Кабель» в содержимом ящика.</p>';
    }
    html += '</div></div>';

    html += '<dl class="cassette-card-stats">';
    html += '<div class="cassette-card-stat"><dt>Тип</dt><dd title="' + escapeHtml(cassetteTypeDisplay) + '">' + escapeHtml(cassetteTypeDisplay) + '</dd></div>';
    html += '<div class="cassette-card-stat"><dt>Ёмкость</dt><dd>' + (maxFibers > 0 ? maxFibers : '—') + '</dd></div>';
    html += '<div class="cassette-card-stat"><dt>Кабелей</dt><dd>' + cableCount + '</dd></div>';
    var cassetteReserve = obj.properties.get('reserveM');
    if (cassetteReserve != null && cassetteReserve !== '' && !isNaN(Number(cassetteReserve)) && Number(cassetteReserve) > 0) {
        html += '<div class="cassette-card-stat"><dt>Запас</dt><dd>' + Number(cassetteReserve) + ' м</dd></div>';
    }
    html += '</dl>';

    if (maxFibers > 0) {
        html += '<div class="cassette-card-usage cassette-card-usage--' + usageTone + '">';
        html += '<div class="cassette-card-usage-head">';
        html += '<span class="cassette-card-usage-label">Волокна</span>';
        html += '<span class="cassette-card-usage-val">' + usedFibers + ' / ' + maxFibers + '</span>';
        html += '</div>';
        html += '<div class="cassette-card-usage-bar" role="progressbar" aria-valuenow="' + Math.min(100, usagePct) + '" aria-valuemin="0" aria-valuemax="100" aria-label="Загрузка волокон">';
        html += '<div class="cassette-card-usage-fill" style="width:' + Math.min(100, usagePct) + '%"></div>';
        html += '</div></div>';
    }
    html += '</section>';

    html += buildObjectCoordsSectionHtml(obj);

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Параметры</h4>';
        html += '<div class="form-group"><label for="editCassetteName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editCassetteName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Кассета А1">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editCassetteType" class="object-card-label">Тип кассеты</label>';
        html += '<select id="editCassetteType" class="form-select">' + (typeof getSpliceCassetteTypeSelectOptionsHtml === 'function' ? getSpliceCassetteTypeSelectOptionsHtml(storedCassetteType ? String(storedCassetteType) : '') : '') + '</select>';
        html += '</div>';
        html += typeof buildHostReserveMFieldHtml === 'function' ? buildHostReserveMFieldHtml(obj, true) : '';
        html += '</section>';
    }

    if (!cableCount) {
        html += '<section class="object-card-section object-card-section--fibers">';
        html += '<div class="object-card-section-head">';
        html += '<h4 class="object-card-section-title">Подключения</h4>';
        html += '<span class="object-card-badge object-card-badge--cassette">0 каб.</span>';
        html += '</div>';
        html += '<div class="object-card-callout object-card-callout--info">';
        html += '<p>Кабели не подключены. После прокладки ВОЛС откроется рабочее место со схемой и таблицей сращиваний.</p>';
        html += '</div></section>';
    }

    html += '</div>';
    return html;
}

function buildSignalPostCardContent(obj, isEditMode) {
    var name = obj.properties.get('name') || '';
    var comment = obj.properties.get('comment') || '';
    var html = '<div class="support-card support-card--signal-post">';

    html += '<section class="object-card-section support-card-hero">';
    html += '<div class="support-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="support-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('signalPost', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="support-card-hero-text">';
    html += '<div class="support-card-view-name">' + escapeHtml(name || 'Без подписи') + '</div>';
    html += '<div class="support-card-view-meta">Сигнальный столб</div>';
    html += '<p class="object-card-hint support-card-hero-hint">Метка на карте для ориентиров и примечаний. Не участвует в прокладке кабеля.</p>';
    if (!isEditMode && comment) {
        html += '<div class="signal-post-card-comment">' + escapeHtml(comment) + '</div>';
    }
    html += '</div></div>';
    html += buildObjectCoordsInlineHtml(obj);
    html += '</section>';

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Редактирование</h4>';
        html += '<div class="form-group"><label for="editSignalPostName" class="object-card-label">Подпись</label>';
        html += '<input type="text" id="editSignalPostName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Столб № 3">';
        html += '</div>';
        html += '<div class="form-group"><label for="editSignalPostComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editSignalPostComment" class="form-input" rows="3" placeholder="Заметка, описание, что установлено на столбе…">' + escapeHtml(comment) + '</textarea>';
        html += '</div>';
        html += '<button type="button" id="saveSignalPostEdit" class="btn-primary support-card-save-btn">Сохранить</button>';
        html += '</section>';
    } else if (comment) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Комментарий</h4>';
        html += '<p class="signal-post-card-comment signal-post-card-comment--block">' + escapeHtml(comment) + '</p>';
        html += '</section>';
    }

    html += buildObjectGallerySectionHtml(obj, isEditMode);

    if (isEditMode) {
        html += '<div class="object-actions-section support-card-actions">';
        html += '<button type="button" id="duplicateCurrentObject" class="btn-secondary">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        html += ' Дублировать</button>';
        html += '<button type="button" id="deleteCurrentObject" class="btn-danger">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        html += ' Удалить</button>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function showSignalPostInfo(obj) {
    if (objectPlacementMode) return;
    applyModalEditModeForObject(obj, function() {
        showSignalPostInfoBody(obj);
    });
}

function showSignalPostInfoBody(obj) {
    currentModalObject = obj;
    var name = obj.properties.get('name') || '';
    document.getElementById('modalTitle').textContent = name ? ('Сигнальный столб: ' + name) : 'Сигнальный столб';
    updateInfoModalChrome('signalPost', name);

    var modalInfoEl = document.getElementById('modalInfo');
    modalInfoEl.innerHTML = buildSignalPostCardContent(obj, modalIsEditMode());

    resetInfoModalFiberLayout();
    var modal = document.getElementById('infoModal');
    setupEditAndDeleteListeners();
    bindObjectGalleryModal(modalInfoEl, obj);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal--centered');
        updateModalLockBanner(getObjectUniqueId(obj));
        applyObjectLocksToMapDraggable();
        if (typeof window.initPanelPlexusCanvases === 'function') {
            requestAnimationFrame(function () { window.initPanelPlexusCanvases(modal); });
        }
    }
}

function getSupportWaypointCopy(isAttachment, waypointType) {
    if (waypointType === 'manhole') {
        return {
            typeLabel: 'Колодец',
            heroHint: 'При прокладке: колодец → карта → второй колодец → опора. Пунктир: клик — проложить подземный участок заново.',
            nameLabel: 'Название',
            editPlaceholder: 'Например: КК-12',
            noCablesMsg: 'Через этот колодец не проходит ни один кабель',
            splitWaypoint: 'Колодец'
        };
    }
    return {
        typeLabel: isAttachment ? 'Крепление узлов' : 'Опора связи',
        heroHint: isAttachment
            ? 'Точка крепления на линии кабеля. При размещении или переносе на кабель он закрепляется автоматически. Можно разрезать ВОЛС и установить муфту.'
            : 'Промежуточная точка линии ВОЛС. При размещении или переносе на кабель он закрепляется автоматически. Можно разрезать кабель и установить муфту на маршруте.',
        nameLabel: isAttachment ? 'Название' : 'Подпись',
        editPlaceholder: isAttachment ? 'Например: стена А' : 'Например: № 15',
        noCablesMsg: isAttachment ? 'Через это крепление не проходит ни один кабель' : 'Через эту опору не проходит ни один кабель',
        splitWaypoint: isAttachment ? 'Крепление' : 'Опора'
    };
}

function buildSupportCardContent(supportObj, isEditMode) {
    var connectedCables = getCablesThroughSupport(supportObj);
    var supportName = supportObj.properties.get('name') || '';
    var waypointType = supportObj.properties.get('type');
    var isAttachment = waypointType === 'attachment';
    var isManhole = waypointType === 'manhole';
    var copy = getSupportWaypointCopy(isAttachment, waypointType);
    var mapType = isManhole ? 'manhole' : (isAttachment ? 'attachment' : 'support');
    var fiberCount = 0;
    var copperCount = 0;
    connectedCables.forEach(function(cable) {
        if (cable.properties.get('cableType') === 'copper') copperCount++;
        else fiberCount++;
    });

    var html = '<div class="support-card support-card--' + mapType + '">';

    html += '<section class="object-card-section support-card-hero">';
    html += '<div class="support-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="support-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg(mapType, { variant: 'normal' }) + '</div>';
    }
    html += '<div class="support-card-hero-text">';
    html += '<div class="support-card-view-meta">';
    html += '<span class="support-kind-pill support-kind-pill--' + mapType + '">' + escapeHtml(copy.typeLabel) + '</span>';
    html += '</div>';
    html += '<div class="support-card-view-name">' + escapeHtml(supportName || (isManhole || isAttachment ? 'Без названия' : 'Без подписи')) + '</div>';
    html += '<p class="object-card-hint support-card-hero-hint">' + copy.heroHint + '</p>';
    html += '</div></div>';

    html += '<dl class="support-card-stats">';
    html += '<div class="support-card-stat"><dt>Кабелей</dt><dd>' + connectedCables.length + '</dd></div>';
    html += '<div class="support-card-stat"><dt>ВОЛС</dt><dd>' + fiberCount + '</dd></div>';
    html += '<div class="support-card-stat"><dt>Медь</dt><dd>' + copperCount + '</dd></div>';
    html += '</dl>';
    html += buildObjectCoordsInlineHtml(supportObj);
    html += '</section>';

    if (isEditMode) {
        html += '<section class="object-card-section support-card-params">';
        html += '<h4 class="object-card-section-title">Параметры</h4>';
        html += '<div class="form-group"><label for="editSupportName" class="object-card-label">' + copy.nameLabel + '</label>';
        html += '<input type="text" id="editSupportName" class="form-input" value="' + escapeHtml(supportName) + '" placeholder="' + escapeHtml(copy.editPlaceholder) + '">';
        html += '</div>';
        html += '<button type="button" id="saveSupportEdit" class="btn-primary support-card-save-btn">Сохранить</button>';
        html += '</section>';
    }

    if (isManhole && isEditMode) {
        var ugRel = findUndergroundRelayoutForManhole(supportObj);
        if (ugRel && ugRel.cable) {
            var relCableId = ugRel.cable.properties.get('uniqueId');
            html += '<section class="object-card-section support-card-underground">';
            html += '<div class="object-card-section-head">';
            html += '<h4 class="object-card-section-title">Подземный участок</h4>';
            html += '</div>';
            html += '<p class="object-card-hint">Проложить трассу между колодцами заново (без правки старых точек).</p>';
            html += '<button type="button" id="manholeRelayoutUnderground" class="btn-secondary support-underground-btn" data-cable-id="' + escapeHtml(relCableId) + '" data-span-index="' + ugRel.spanIndex + '">Проложить заново</button>';
            html += '</section>';
        }
    }

    var splittableAtSupport = isEditMode ? getSplittableFiberCablesAtWaypoint(supportObj) : [];
    if (splittableAtSupport.length) {
        html += '<section class="object-card-section object-card-section--split cable-split-section support-split-card">';
        html += '<div class="support-split-head">';
        html += '<div class="support-split-icon" aria-hidden="true">';
        html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>';
        html += '</div>';
        html += '<div class="support-split-titles">';
        html += '<h4 class="object-card-section-title cable-split-section__title">Муфта на маршруте</h4>';
        html += '<p class="object-card-hint cable-split-section__desc">Выберите тип муфты и кабель. ' + copy.splitWaypoint + ' останется в обоих сегментах.</p>';
        html += '</div></div>';
        html += buildCableSplitSleeveFieldsHtml();
        html += '<div class="cable-split-pick-list">';
        splittableAtSupport.forEach(function(cable) {
            var cid = cable.properties.get('uniqueId');
            html += '<button type="button" class="btn-secondary btn-cable-split-pick btn-split-cable-at-waypoint" data-cable-id="' + escapeHtml(cid) + '">';
            html += '<span class="support-split-pick-label">Разделить</span>';
            html += '<span class="support-split-pick-cable">' + escapeHtml(getCableSplitLabel(cable)) + '</span>';
            html += '</button>';
        });
        html += '</div></section>';
    }

    html += '<section class="object-card-section object-card-section--cables">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Проходящие кабели</h4>';
    html += '<span class="object-card-badge object-card-badge--' + mapType + '">' + connectedCables.length + '</span>';
    html += '</div>';

    if (connectedCables.length === 0) {
        html += '<div class="object-card-callout object-card-callout--info">';
        html += '<p>' + copy.noCablesMsg + '</p>';
        html += '</div>';
    } else {
        html += '<div class="support-cable-list">';
        connectedCables.forEach(function(cable, index) {
            var cableType = cable.properties.get('cableType');
            var cableDescription = getCableDescription(cableType, cable);
            var cableName = cable.properties.get('cableName') || '';
            var cableColor = getCableColor(cableType);
            var isCopper = cableType === 'copper';
            var fibers = isCopper ? [] : getFiberColors(cable);
            var distance = cable.properties.get('distance');
            var fromObj = cable.properties.get('from');
            var toObj = cable.properties.get('to');
            var fromName = fromObj ? (fromObj.properties.get('name') || getObjectTypeName(fromObj.properties.get('type'))) : '—';
            var toName = toObj ? (toObj.properties.get('name') || getObjectTypeName(toObj.properties.get('type'))) : '—';
            var title = cableName ? escapeHtml(cableName) : ('Кабель ' + (index + 1));

            html += '<article class="support-cable-item" style="--cable-accent:' + escapeHtml(cableColor) + '">';
            html += '<div class="support-cable-item-head">';
            html += '<h5 class="support-cable-item-title">' + title + '</h5>';
            html += '<span class="support-cable-type-pill' + (isCopper ? ' support-cable-type-pill--copper' : ' support-cable-type-pill--fiber') + '">' + escapeHtml(cableDescription) + '</span>';
            html += '</div>';
            html += '<div class="support-cable-route">';
            html += '<span class="support-cable-route-from">' + escapeHtml(fromName) + '</span>';
            html += '<span class="support-cable-route-arrow" aria-hidden="true">→</span>';
            html += '<span class="support-cable-route-to">' + escapeHtml(toName) + '</span>';
            if (distance) html += '<span class="support-cable-route-dist">' + distance + ' м</span>';
            html += '</div>';
            if (isCopper) {
                html += '<p class="support-cable-copper-note">Медный кабель · жилы не отображаются</p>';
            } else if (fibers.length) {
                html += '<div class="support-fiber-chips" title="Жилы кабеля">';
                fibers.forEach(function(fiber) {
                    var chipClass = 'support-fiber-chip';
                    if (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') {
                        chipClass += ' support-fiber-chip--light';
                    }
                    html += '<span class="' + chipClass + '" title="' + escapeHtml(fiber.name || '') + '">';
                    html += '<span class="support-fiber-chip-dot" style="background:' + fiber.color + ';border-color:' + (fiber.hasBlackRing ? '#000' : 'rgba(0,0,0,0.25)') + '"></span>';
                    html += '<span class="support-fiber-chip-num">' + fiber.number + '</span>';
                    html += '</span>';
                });
                html += '</div>';
            }
            html += '</article>';
        });
        html += '</div>';
    }
    html += '</section>';

    html += buildObjectGallerySectionHtml(supportObj, isEditMode);

    if (isEditMode) {
        html += '<div class="object-actions-section support-card-actions">';
        html += '<button type="button" id="duplicateCurrentObject" class="btn-secondary">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        html += ' Дублировать</button>';
        html += '<button type="button" id="deleteCurrentObject" class="btn-danger">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        html += ' Удалить</button>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function showSupportInfo(supportObj) {
    if (objectPlacementMode) return;
    if (radioBridgeRoutingMode && radioBridgeRoutingData && supportObj) {
        var rbType = supportObj.properties ? supportObj.properties.get('type') : null;
        if (typeof handleRadioBridgeRoutingPlacemarkClick === 'function' &&
            handleRadioBridgeRoutingPlacemarkClick(supportObj, rbType)) {
            return;
        }
    }
    applyModalEditModeForObject(supportObj, function() {
        showSupportInfoBody(supportObj);
    });
}

function showSupportInfoBody(supportObj) {
    currentModalObject = supportObj;

    var supportName = supportObj.properties.get('name') || '';
    var waypointType = supportObj.properties.get('type');
    var isAttachment = waypointType === 'attachment';
    var copy = getSupportWaypointCopy(isAttachment, waypointType);

    document.getElementById('modalTitle').textContent = supportName ? (copy.typeLabel + ': ' + supportName) : copy.typeLabel;
    updateInfoModalChrome(waypointType, supportName);

    var modalInfoEl = document.getElementById('modalInfo');
    modalInfoEl.innerHTML = buildSupportCardContent(supportObj, modalIsEditMode());
    bindCableSplitSleeveFields(modalInfoEl);

    resetInfoModalFiberLayout();
    var modal = document.getElementById('infoModal');
    setupEditAndDeleteListeners();
    bindObjectGalleryModal(modalInfoEl, supportObj);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal--centered');
        updateModalLockBanner(getObjectUniqueId(supportObj));
        applyObjectLocksToMapDraggable();
        if (typeof window.initPanelPlexusCanvases === 'function') {
            requestAnimationFrame(function () { window.initPanelPlexusCanvases(modal); });
        }
    }
}

/** Обновить карточку объекта: опора и крепление — через showSupportInfo, остальные — showObjectInfo. */
function refreshObjectModal(obj) {
    if (!obj || !obj.properties || !isObjectOnMap(obj)) return;
    var t = obj.properties.get('type');
    if (t === 'support' || t === 'attachment' || t === 'manhole') showSupportInfo(obj);
    else if (t === 'signalPost') showSignalPostInfo(obj);
    else if (t === 'cabinet') showCabinetInfo(obj);
    else if (t === 'region') showRegionEditModal(obj);
    else showObjectInfo(obj);
}

function setupEditAndDeleteListeners() {
    bindModalObjectNameEditors();
    attachObjectCoordsSectionHandlers(document.getElementById('modalInfo'));
    if (!window._modalSwitchCatalogDelegates) {
        var modalRoot = document.getElementById('infoModal');
        if (modalRoot) {
            window._modalSwitchCatalogDelegates = true;
            modalRoot.addEventListener('input', function(e) {
                var t = e.target;
                if (!t) return;
                var co = currentModalObject;
                if (!co || !co.properties || co.properties.get('type') !== 'node') return;
                if (t.classList && t.classList.contains('edit-node-switch-name')) {
                    var swIdNm = t.getAttribute('data-switch-id');
                    if (swIdNm) {
                        updateAttachedSwitchMeta(co, swIdNm, 'name', t.value.trim());
                        saveData();
                    }
                    return;
                }
                if (t.classList && t.classList.contains('edit-node-switch-comment')) {
                    var swIdCmt = t.getAttribute('data-switch-id');
                    if (swIdCmt) {
                        updateAttachedSwitchMeta(co, swIdCmt, 'comment', t.value.trim());
                        saveData();
                    }
                    return;
                }
                if (t.classList && t.classList.contains('edit-node-switch-ip')) {
                    var swIdIp = t.getAttribute('data-switch-id');
                    if (swIdIp) {
                        updateAttachedSwitchMeta(co, swIdIp, 'ipAddress', t.value.trim());
                        saveData();
                    }
                    return;
                }
                if (t.classList && t.classList.contains('equipment-ip-input')) {
                    if (!co) return;
                    var objType = co.properties.get('type');
                    if (objType === 'olt' || objType === 'onu' || objType === 'camera' || objType === 'mediaConverter' || objType === 'radioBridge' || objType === 'cabinet') {
                        co.properties.set('ipAddress', t.value.trim());
                        saveData();
                    }
                    return;
                }
                if (t.classList && t.classList.contains('edit-node-switch-port-label')) {
                    var swIdLbl = t.getAttribute('data-switch-id');
                    var portLbl = parseInt(t.getAttribute('data-port'), 10);
                    if (swIdLbl && !isNaN(portLbl) && portLbl >= 1) {
                        setAttachedSwitchPortLabel(co, swIdLbl, portLbl, t.value);
                        saveData();
                    }
                    return;
                }
                if (!t.id) return;
                var mfrM = /^editNodeSwMfr_(.+)$/.exec(t.id);
                if (mfrM) {
                    updateAttachedSwitchMeta(co, mfrM[1], 'manufacturer', t.value || '');
                    if (typeof populateModelDatalistForManufacturer === 'function') populateModelDatalistForManufacturer((t.value || '').trim(), 'deviceModelsList', 'switch');
                    saveData();
                    return;
                }
                var modM = /^editNodeSwMod_(.+)$/.exec(t.id);
                if (modM) {
                    updateAttachedSwitchMeta(co, modM[1], 'model', t.value || '');
                    saveData();
                }
            });
            modalRoot.addEventListener('change', function(e) {
                var t = e.target;
                if (!t) return;
                var coCh = currentModalObject;
                if (coCh && coCh.properties && coCh.properties.get('type') === 'node' && t.classList && t.classList.contains('edit-node-switch-port-busy')) {
                    var swIdBusy = t.getAttribute('data-switch-id');
                    var portBusy = parseInt(t.getAttribute('data-port'), 10);
                    if (swIdBusy && !isNaN(portBusy) && portBusy >= 1) {
                        setAttachedSwitchPortManualBusy(coCh, swIdBusy, portBusy, !!t.checked);
                        saveData();
                        refreshObjectModal(coCh);
                    }
                    return;
                }
                if (!t.id || t.id !== 'newNodeSwitchModel') return;
                var mfrH = document.getElementById('newNodeSwitchManufacturer');
                var pcEl = document.getElementById('newNodeSwitchPortCount');
                var pkEl = document.getElementById('newNodeSwitchPortKind');
                var mfr = mfrH ? (mfrH.value || '').trim() : '';
                var mod = (t.value || '').trim();
                var catalogTypes = typeof getSwitchModelPortTypes === 'function' ? getSwitchModelPortTypes(mfr, mod) : null;
                if (catalogTypes && catalogTypes.length && pcEl) {
                    pcEl.value = String(catalogTypes.length);
                    if (pkEl && catalogTypes[0]) pkEl.value = catalogTypes[0];
                    return;
                }
                var n = typeof getSwitchModelDefaultPortCount === 'function' ? getSwitchModelDefaultPortCount(mfr, mod) : null;
                if (n != null && n >= 1 && n <= 96 && pcEl) pcEl.value = String(n);
            }, true);
        }
    }

    const editNodeKindSelect = document.getElementById('editNodeKind');
    if (editNodeKindSelect) {
        editNodeKindSelect.addEventListener('change', function() {
            if (!currentModalObject) return;
            const newNodeKind = this.value || 'network';
            currentModalObject.properties.set('nodeKind', newNodeKind);
            updateNodeIcon(currentModalObject);
            updateNodeDisplay();
            saveData();
            if (typeof updateInfoModalChrome === 'function') {
                updateInfoModalChrome('node', currentModalObject.properties.get('name') || '');
            }
            var nodeCard = document.querySelector('.node-card');
            if (nodeCard) {
                nodeCard.classList.remove('node-card--network', 'node-card--aggregation');
                nodeCard.classList.add(newNodeKind === 'aggregation' ? 'node-card--aggregation' : 'node-card--network');
            }
            var heroIcon = document.querySelector('.node-card-hero-icon');
            if (heroIcon && window.MapIcons) {
                heroIcon.innerHTML = MapIcons.buildIconSvg('node', { variant: 'normal', nodeKind: newNodeKind });
            }
        });
    }

    const editNodeCommentInput = document.getElementById('editNodeComment');
    if (editNodeCommentInput) {
        editNodeCommentInput.addEventListener('input', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            currentModalObject.properties.set('comment', this.value || '');
            saveData();
        });
    }

    var editOltManufacturer = document.getElementById('editOltManufacturer');
    if (editOltManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOltManufacturer);
        editOltManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'olt') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'olt'); });
        editOltManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'olt'); });
    }
    var editOltModel = document.getElementById('editOltModel');
    if (editOltModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOltModel);
        editOltModel.addEventListener('input', function() {
            if (currentModalObject && currentModalObject.properties.get('type') === 'olt') {
                currentModalObject.properties.set('model', this.value || '');
                var mfrEl = document.getElementById('editOltManufacturer');
                var mfr = mfrEl ? (mfrEl.value || '').trim() : '';
                if (typeof applyOltModelCatalogSettings === 'function') {
                    applyOltModelCatalogSettings(currentModalObject, mfr, this.value || '');
                }
                saveData();
            }
        });
        editOltModel.addEventListener('change', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
            var mfrEl = document.getElementById('editOltManufacturer');
            var mfr = mfrEl ? (mfrEl.value || '').trim() : '';
            if (typeof applyOltModelCatalogSettings === 'function') {
                applyOltModelCatalogSettings(currentModalObject, mfr, this.value || '');
                saveData();
                refreshObjectModal(currentModalObject);
            }
        });
    }
    var editOltComment = document.getElementById('editOltComment');
    if (editOltComment) editOltComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'olt') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });
    var editOnuManufacturer = document.getElementById('editOnuManufacturer');
    if (editOnuManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOnuManufacturer);
        editOnuManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'onu') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'onu'); });
        editOnuManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'onu'); });
    }
    var editOnuModel = document.getElementById('editOnuModel');
    if (editOnuModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOnuModel);
        editOnuModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'onu') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editOnuComment = document.getElementById('editOnuComment');
    if (editOnuComment) editOnuComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'onu') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editCameraManufacturer = document.getElementById('editCameraManufacturer');
    if (editCameraManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editCameraManufacturer);
        editCameraManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'camera') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'camera'); });
        editCameraManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'camera'); });
    }
    var editCameraModel = document.getElementById('editCameraModel');
    if (editCameraModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editCameraModel);
        editCameraModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'camera') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editCameraComment = document.getElementById('editCameraComment');
    if (editCameraComment) editCameraComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'camera') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editMediaConverterManufacturer = document.getElementById('editMediaConverterManufacturer');
    if (editMediaConverterManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editMediaConverterManufacturer);
        editMediaConverterManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'mediaConverter') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'node'); });
        editMediaConverterManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'node'); });
    }
    var editMediaConverterModel = document.getElementById('editMediaConverterModel');
    if (editMediaConverterModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editMediaConverterModel);
        editMediaConverterModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'mediaConverter') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editMediaConverterComment = document.getElementById('editMediaConverterComment');
    if (editMediaConverterComment) editMediaConverterComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'mediaConverter') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editRadioBridgeName = document.getElementById('editRadioBridgeName');
    if (editRadioBridgeName) editRadioBridgeName.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'radioBridge') applyRadioBridgeNameChange(this.value); });
    var editRadioBridgeMode = document.getElementById('editRadioBridgeMode');
    if (editRadioBridgeMode) editRadioBridgeMode.addEventListener('change', function() {
        if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge' || isRadioBridgeLinked(currentModalObject)) return;
        var mode = this.value === 'ptmp' ? 'ptmp' : 'ptp';
        currentModalObject.properties.set('bridgeMode', mode);
        currentModalObject.properties.set('role', mode === 'ptp' ? 'ptp' : (currentModalObject.properties.get('role') === 'ap' ? 'ap' : 'station'));
        saveData();
        showObjectInfo(currentModalObject);
    });
    var editRadioBridgeRole = document.getElementById('editRadioBridgeRole');
    if (editRadioBridgeRole) editRadioBridgeRole.addEventListener('change', function() {
        if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge' || isRadioBridgeLinked(currentModalObject)) return;
        currentModalObject.properties.set('role', this.value === 'ap' ? 'ap' : 'station');
        saveData();
    });
    var editRadioBridgeManufacturer = document.getElementById('editRadioBridgeManufacturer');
    if (editRadioBridgeManufacturer) {
        editRadioBridgeManufacturer.addEventListener('input', function() {
            if (currentModalObject && currentModalObject.properties.get('type') === 'radioBridge') {
                currentModalObject.properties.set('manufacturer', this.value || '');
                saveData();
            }
            populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'radioBridge');
        });
        editRadioBridgeManufacturer.addEventListener('change', function() {
            populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'radioBridge');
        });
    }
    var editRadioBridgeModel = document.getElementById('editRadioBridgeModel');
    if (editRadioBridgeModel) editRadioBridgeModel.addEventListener('input', function() {
        if (currentModalObject && currentModalObject.properties.get('type') === 'radioBridge') {
            currentModalObject.properties.set('model', this.value || '');
            saveData();
        }
    });
    var editRadioBridgeComment = document.getElementById('editRadioBridgeComment');
    if (editRadioBridgeComment) editRadioBridgeComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'radioBridge') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editCrossCopperPortsEl = document.getElementById('editCrossCopperPorts');
    if (editCrossCopperPortsEl) {
        editCrossCopperPortsEl.addEventListener('change', function() {
            if (!currentModalObject || !isCrossLikeHostType(currentModalObject.properties.get('type'))) return;
            var newVal = parseInt(this.value, 10);
            if (isNaN(newVal)) newVal = 0;
            newVal = Math.max(0, newVal);
            var usage = currentModalObject.properties.get('copperPortUsage') || {};
            var maxUsed = 0;
            Object.keys(usage).forEach(function(k) {
                var n = parseInt(k, 10);
                if (!isNaN(n) && n > maxUsed) maxUsed = n;
            });
            if (newVal < maxUsed) {
                if (typeof showError === 'function') showError('На медных портах есть кабели (до порта ' + maxUsed + '). Уменьшить число портов нельзя.', 'Медные порты');
                var curCcp = Math.max(0, parseInt(currentModalObject.properties.get('crossCopperPorts'), 10) || 0);
                this.value = String(curCcp);
                return;
            }
            currentModalObject.properties.set('crossCopperPorts', newVal);
            saveData();
            if (typeof rebuildAllCopperPortUsageFromCables === 'function') rebuildAllCopperPortUsageFromCables();
        });
    }

    var editSleeveTypeSelect = document.getElementById('editSleeveType');
    if (editSleeveTypeSelect) {
        editSleeveTypeSelect.addEventListener('change', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'sleeve') return;
            var newType = this.value;
            if (!newType) {
                try {
                    currentModalObject.properties.unset('sleeveType');
                } catch (eUnset) {}
            } else {
                currentModalObject.properties.set('sleeveType', newType);
            }
            currentModalObject.properties.set('maxFibers', 0);
            saveData();
            refreshObjectModal(currentModalObject);
        });
    }

    var editCassetteTypeSelect = document.getElementById('editCassetteType');
    if (editCassetteTypeSelect) {
        editCassetteTypeSelect.addEventListener('change', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'spliceCassette') return;
            var newType = this.value;
            if (!newType) {
                try { currentModalObject.properties.unset('cassetteType'); } catch (eUnset) {}
            } else {
                currentModalObject.properties.set('cassetteType', newType);
            }
            if (typeof getDefaultMaxFibersForCassetteType === 'function') {
                currentModalObject.properties.set('maxFibers', getDefaultMaxFibersForCassetteType(newType));
            }
            saveData();
            refreshObjectModal(currentModalObject);
        });
    }

    var editCrossTypeSelect = document.getElementById('editCrossType');
    if (editCrossTypeSelect) {
        editCrossTypeSelect.addEventListener('change', function() {
            if (!currentModalObject || !isCrossLikeHostType(currentModalObject.properties.get('type'))) return;
            var newType = this.value;
            if (!newType) {
                try {
                    currentModalObject.properties.unset('crossType');
                } catch (eUnsetCross) {}
            } else {
                currentModalObject.properties.set('crossType', newType);
                if (typeof getDefaultPortsForCrossType === 'function') {
                    currentModalObject.properties.set('crossPorts', getDefaultPortsForCrossType(newType));
                }
            }
            saveData();
            refreshObjectModal(currentModalObject);
        });
    }
    
    var btnAddNodeSwitch = document.getElementById('btnAddNodeSwitch');
    if (btnAddNodeSwitch) {
        btnAddNodeSwitch.addEventListener('click', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            var nmEl = document.getElementById('newNodeSwitchName');
            var pcEl = document.getElementById('newNodeSwitchPortCount');
            var pkEl = document.getElementById('newNodeSwitchPortKind');
            var mfrEl = document.getElementById('newNodeSwitchManufacturer');
            var modEl = document.getElementById('newNodeSwitchModel');
            var nm = nmEl ? nmEl.value.trim() : '';
            var pcRaw = pcEl ? pcEl.value : '24';
            var pc = Math.max(1, Math.min(96, parseInt(pcRaw, 10) || 24));
            var pk = pkEl ? pkEl.value : (typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)');
            var mfr = mfrEl ? mfrEl.value.trim() : '';
            var mod = modEl ? modEl.value.trim() : '';
            addAttachedSwitchToNode(currentModalObject, nm, pc, pk, mfr, mod);
            saveData();
            refreshObjectModal(currentModalObject);
        });
    }
    document.querySelectorAll('.btn-remove-node-switch').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            var sid = this.getAttribute('data-switch-id');
            if (!sid) return;
            if (removeAttachedSwitchFromNode(currentModalObject, sid)) {
                saveData();
                refreshObjectModal(currentModalObject);
            }
        });
    });
    var modalInfoNodeSw = document.getElementById('modalInfo');
    if (modalInfoNodeSw) {
        modalInfoNodeSw.querySelectorAll('.edit-node-switch-port-kind').forEach(function(sel) {
            sel.addEventListener('change', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
                var swId = this.getAttribute('data-switch-id');
                var idx = parseInt(this.getAttribute('data-idx'), 10);
                if (!swId || isNaN(idx) || idx < 0) return;
                var arr = getNodeAttachedSwitches(currentModalObject).slice();
                var ix = arr.findIndex(function(s) { return s.uniqueId === swId; });
                if (ix < 0) return;
                var sw = Object.assign({}, arr[ix]);
                var pt = (sw.switchPortTypes || []).slice();
                while (pt.length <= idx) pt.push(typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)');
                pt[idx] = this.value;
                sw.switchPortTypes = pt;
                arr[ix] = sw;
                currentModalObject.properties.set('attachedSwitches', arr);
                saveData();
            });
        });
    }
    
    var saveSupportBtn = document.getElementById('saveSupportEdit');
    if (saveSupportBtn) {
        saveSupportBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var wt = currentModalObject.properties.get('type');
            if (wt !== 'support' && wt !== 'attachment' && wt !== 'manhole') return;
            flushNameFieldIfChanged('editSupportName', applySupportNameChange);
            showSupportInfo(currentModalObject);
        });
    }

    var saveSignalPostBtn = document.getElementById('saveSignalPostEdit');
    if (saveSignalPostBtn) {
        saveSignalPostBtn.addEventListener('click', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'signalPost') return;
            flushNameFieldIfChanged('editSignalPostName', applySignalPostNameChange);
            var commentEl = document.getElementById('editSignalPostComment');
            if (commentEl) currentModalObject.properties.set('comment', commentEl.value || '');
            saveData();
            showSignalPostInfo(currentModalObject);
        });
    }

    var editSignalPostComment = document.getElementById('editSignalPostComment');
    if (editSignalPostComment) {
        editSignalPostComment.addEventListener('input', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'signalPost') return;
            currentModalObject.properties.set('comment', this.value || '');
            saveData();
        });
    }

    var manholeRelayoutBtn = document.getElementById('manholeRelayoutUnderground');
    if (manholeRelayoutBtn) {
        manholeRelayoutBtn.addEventListener('click', function() {
            var cableId = manholeRelayoutBtn.getAttribute('data-cable-id');
            var spanIdx = parseInt(manholeRelayoutBtn.getAttribute('data-span-index'), 10);
            if (!cableId || isNaN(spanIdx)) return;
            var cable = findObjectByUniqueId(cableId);
            if (!cable) return;
            if (typeof closeInfoModal === 'function') closeInfoModal();
            startUndergroundSpanRelayout(cable, spanIdx);
        });
    }

    const saveChangesBtn = document.getElementById('saveChangesBtn');
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', function() {
            flushModalNamesFromEditor();
            if (typeof flushHostReserveMFromEditor === 'function') flushHostReserveMFromEditor();
            saveData();
            showInfo('Изменения сохранены', 'Сохранено');
        });
    }

    const duplicateBtn = document.getElementById('duplicateCurrentObject');
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            
            duplicateObject(currentModalObject);
        });
    }

    document.querySelectorAll('.btn-split-cable-at-waypoint').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var t = currentModalObject.properties.get('type');
            if (t !== 'support' && t !== 'attachment') return;
            var cableId = btn.getAttribute('data-cable-id');
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableId;
            });
            if (cable) {
                var sleeveOpts = readCableSplitSleeveOptions(document.getElementById('modalInfo'));
                splitCableAtWaypoint(currentModalObject, cable, sleeveOpts);
            }
        });
    });

    const deleteBtn = document.getElementById('deleteCurrentObject');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var objToDelete = currentModalObject;
            (async function() {
                await confirmAndDeleteObject(objToDelete);
            })();
        });
    }

}

function duplicateObject(obj) {
    if (!obj || !obj.geometry) return;
    
    const type = obj.properties.get('type');
    const name = obj.properties.get('name') || '';
    const coords = obj.geometry.getCoordinates();
    const offset = 0.0002; 
    const newCoords = [coords[0] + offset, coords[1] + offset];

    var newName = name;
    if (type === 'node' && name) {
        newName = name + ' (копия)';
        var copyNum = 2;
        while (findNodeByName(newName)) {
            newName = name + ' (копия ' + copyNum + ')';
            copyNum++;
        }
    }
    if (type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter' || type === 'radioBridge') {
        if (name) newName = name + ' (копия)';
    }
    if (type === 'signalPost') {
        if (name) newName = name + ' (копия)';
    }
    if (type === 'cabinet') {
        if (name) newName = name + ' (копия)';
    }
    
    var opts = {};
    if (type === 'node') {
        opts.nodeKind = obj.properties.get('nodeKind') || 'network';
        opts.comment = obj.properties.get('comment') || '';
    }
    if (type === 'signalPost') {
        opts.comment = obj.properties.get('comment') || '';
    }
    if (type === 'cabinet') {
        opts.comment = obj.properties.get('comment') || '';
        opts.manufacturer = obj.properties.get('manufacturer') || '';
        opts.model = obj.properties.get('model') || '';
        opts.cabinetMount = obj.properties.get('cabinetMount') || '';
        opts.cabinetHeight = obj.properties.get('cabinetHeight') || '';
        opts.cabinetWidth = obj.properties.get('cabinetWidth') || '';
        opts.cabinetUnits = obj.properties.get('cabinetUnits') || '';
        opts.address = obj.properties.get('address') || '';
        opts.inventoryNumber = obj.properties.get('inventoryNumber') || '';
        opts.serialNumber = obj.properties.get('serialNumber') || '';
        opts.ipAddress = obj.properties.get('ipAddress') || '';
    }
    if (type === 'camera' || type === 'mediaConverter' || type === 'radioBridge') {
        opts.manufacturer = obj.properties.get('manufacturer') || '';
        opts.model = obj.properties.get('model') || '';
        opts.comment = obj.properties.get('comment') || '';
        opts.ipAddress = obj.properties.get('ipAddress') || '';
    }
    if (type === 'radioBridge') {
        opts.bridgeMode = obj.properties.get('bridgeMode') || 'ptp';
        opts.role = obj.properties.get('role') || (opts.bridgeMode === 'ptp' ? 'ptp' : 'station');
    }
    if (type === 'camera' && window.CameraPlayer) {
        var sc = CameraPlayer.getCameraStreamConfig(obj);
        opts.streamType = sc.streamType;
        opts.streamUrl = sc.streamUrl;
        opts.streamUser = sc.streamUser;
        opts.streamPass = sc.streamPass;
        opts.streamAutoplay = sc.streamAutoplay;
        opts.streamMuted = sc.streamMuted;
        var snap = CameraPlayer.getCameraSnapshot(obj);
        if (snap) opts.snapshotPhoto = snap;
    }

    createObject(type, newName, newCoords, Object.keys(opts).length ? opts : undefined);

    const newObj = objects[objects.length - 1];
    if (!newObj) return;

    if (type === 'olt') {
        newObj.properties.set('ponPorts', obj.properties.get('ponPorts') || 8);
        newObj.properties.set('incomingFiber', null);
        newObj.properties.set('portAssignments', {});
        newObj.properties.set('portLabels', Object.assign({}, obj.properties.get('portLabels') || {}));
        newObj.properties.set('ponPortTypes', Array.isArray(obj.properties.get('ponPortTypes'))
            ? obj.properties.get('ponPortTypes').slice()
            : []);
        if (obj.properties.get('manufacturer')) newObj.properties.set('manufacturer', obj.properties.get('manufacturer'));
        if (obj.properties.get('model')) newObj.properties.set('model', obj.properties.get('model'));
        if (obj.properties.get('comment')) newObj.properties.set('comment', obj.properties.get('comment'));
        if (obj.properties.get('ipAddress')) newObj.properties.set('ipAddress', obj.properties.get('ipAddress'));
    }
    if (type === 'splitter') {
        newObj.properties.set('splitRatio', obj.properties.get('splitRatio') || 8);
        newObj.properties.set('inputFiber', null);
        newObj.properties.set('outputConnections', []);
        newObj.properties.set('outputLabels', []);
    }
    if (type === 'onu') {
        newObj.properties.set('incomingFiber', null);
        if (obj.properties.get('manufacturer')) newObj.properties.set('manufacturer', obj.properties.get('manufacturer'));
        if (obj.properties.get('model')) newObj.properties.set('model', obj.properties.get('model'));
        if (obj.properties.get('comment')) newObj.properties.set('comment', obj.properties.get('comment'));
        if (obj.properties.get('ipAddress')) newObj.properties.set('ipAddress', obj.properties.get('ipAddress'));
    }
    if (type === 'mediaConverter') {
        newObj.properties.set('incomingFiber', null);
    }
    if (type === 'node' && newObj) {
        var attSrc = obj.properties.get('attachedSwitches');
        if (Array.isArray(attSrc) && attSrc.length) {
            var t0 = Date.now();
            newObj.properties.set('attachedSwitches', attSrc.map(function (sw, idx) {
                var o = {
                    uniqueId: 'sw-' + t0 + '-' + idx + '-' + Math.random().toString(36).substr(2, 9),
                    name: (sw && sw.name) ? String(sw.name) : 'Коммутатор',
                    switchPortTypes: Array.isArray(sw && sw.switchPortTypes) ? sw.switchPortTypes.slice() : [],
                    copperPortUsage: {},
                    portLabels: sw && sw.portLabels && typeof sw.portLabels === 'object' ? Object.assign({}, sw.portLabels) : {},
                    manualPortUsage: {}
                };
                if (sw && sw.manufacturer) o.manufacturer = String(sw.manufacturer);
                if (sw && sw.model) o.model = String(sw.model);
                if (sw && sw.comment) o.comment = String(sw.comment);
                if (sw && sw.ipAddress) o.ipAddress = String(sw.ipAddress);
                return o;
            }));
        }
    }

    const modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    currentModalObject = null;
    saveData();
}

function updateNodeLabel(placemark, name) {
    updateObjectLabel(placemark, name);
}

function syncObjectNameOp(obj, trimmed) {
    if (!obj || !obj.properties) return;
    obj.properties.set('name', trimmed);
    if (typeof updateObjectLabel === 'function') updateObjectLabel(obj, trimmed);
    saveData({ object: obj });
}

function flushNameFieldIfChanged(inputId, applyFn) {
    var inp = document.getElementById(inputId);
    if (!inp || !currentModalObject || !currentModalObject.properties) return;
    var trimmed = (inp.value || '').trim();
    var cur = (currentModalObject.properties.get('name') || '').trim();
    if (trimmed !== cur) applyFn(trimmed);
}

function applyCrossNameChange(newName) {
    if (!currentModalObject || !isCrossLikeHostType(currentModalObject.properties.get('type'))) return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Оптический кросс: ' + trimmed : 'Оптический кросс');
    updateObjectLabel(currentModalObject, trimmed);
    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Оптический кросс: ' + trimmed : 'Оптический кросс';
    var sideTitle = document.querySelector('.fiber-ws-side-title');
    if (sideTitle) sideTitle.textContent = trimmed || 'Кросс';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applySleeveNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'sleeve') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Кабельная муфта: ' + trimmed : 'Кабельная муфта');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Кабельная муфта: ' + trimmed : 'Кабельная муфта';
    var sideTitle = document.querySelector('.fiber-ws-side-title');
    if (sideTitle) sideTitle.textContent = trimmed || 'Муфта';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyCassetteNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'spliceCassette') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Сплайс-кассета: ' + trimmed : 'Сплайс-кассета');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Сплайс-кассета: ' + trimmed : 'Сплайс-кассета';
    var sideTitle = document.querySelector('.fiber-ws-side-title');
    if (sideTitle) sideTitle.textContent = trimmed || 'Сплайс-кассета';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyNodeNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
    var trimmed = (newName || '').trim();
    if (trimmed && typeof findNodeByName === 'function' && findNodeByName(trimmed, currentModalObject)) return;
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Узел сети: ' + trimmed : 'Узел сети');
    updateNodeLabel(currentModalObject, trimmed);
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Узел сети: ' + trimmed : 'Узел сети';
    var cardName = document.querySelector('.node-card-view-name');
    if (cardName) cardName.textContent = trimmed || 'Новый узел';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyOltNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'OLT: ' + trimmed : 'OLT (GPON)');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'OLT: ' + trimmed : 'OLT (GPON)';
    var cardName = document.querySelector('.olt-card-view-name');
    if (cardName) cardName.textContent = trimmed || 'Новый OLT';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applySplitterNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    if (!currentModalObject._embedded) {
        currentModalObject.properties.set('balloonContent', trimmed ? 'Сплиттер: ' + trimmed : 'Сплиттер');
        updateObjectLabel(currentModalObject, trimmed);
    }
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Сплиттер: ' + trimmed : 'Сплиттер';
    saveData();
    if (currentModalObject._embedded && currentModalObject._host) {
        syncObjectNameOp(currentModalObject, trimmed);
        return;
    }
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyOnuNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'onu') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'ONU: ' + trimmed : 'ONU');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'ONU: ' + trimmed : 'ONU';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyCameraNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'camera') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Камера: ' + trimmed : 'Камера');
    updateObjectLabel(currentModalObject, trimmed);
    if (typeof refreshCameraMapPresentation === 'function') refreshCameraMapPresentation(currentModalObject);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Камера: ' + trimmed : 'Камера';
    var cardName = document.querySelector('.camera-card-view-name');
    if (cardName) cardName.textContent = trimmed || 'Новая камера';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyMediaConverterNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'mediaConverter') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Медиаконвертер: ' + trimmed : 'Медиаконвертер');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Медиаконвертер: ' + trimmed : 'Медиаконвертер';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyRadioBridgeNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Wi‑Fi радиомост: ' + trimmed : 'Wi‑Fi радиомост');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Wi‑Fi радиомост: ' + trimmed : 'Wi‑Fi радиомост';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applySupportNameChange(newName) {
    if (!currentModalObject) return;
    var wt = currentModalObject.properties.get('type');
    if (wt !== 'support' && wt !== 'attachment' && wt !== 'manhole') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    if (wt === 'attachment') {
        currentModalObject.properties.set('balloonContent', trimmed ? 'Крепление узлов: ' + trimmed : 'Крепление узлов');
    } else if (wt === 'manhole') {
        currentModalObject.properties.set('balloonContent', trimmed ? 'Колодец: ' + trimmed : 'Колодец');
    } else {
        currentModalObject.properties.set('balloonContent', trimmed ? 'Опора связи: ' + trimmed : 'Опора связи');
    }
    updateSupportLabel(currentModalObject, trimmed);
    var lbl = currentModalObject.properties.get('label');
    if (lbl && trimmed) {
        try { myMap.geoObjects.add(lbl); } catch (e) {}
    } else if (lbl && !trimmed) {
        try { myMap.geoObjects.remove(lbl); } catch (e) {}
    }
    var copy = typeof getSupportWaypointCopy === 'function' ? getSupportWaypointCopy(wt === 'attachment', wt) : { typeLabel: 'Объект' };
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? (copy.typeLabel + ': ' + trimmed) : copy.typeLabel;
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function bindModalNameField(inputId, applyFn) {
    var el = document.getElementById(inputId);
    if (!el) return;
    el.oninput = function() { applyFn(this.value); };
    el.onchange = function() { applyFn(this.value); };
}

function bindModalObjectNameEditors() {
    bindModalNameField('editCrossName', applyCrossNameChange);
    bindModalNameField('editSleeveName', applySleeveNameChange);
    bindModalNameField('editCassetteName', applyCassetteNameChange);
    bindModalNameField('editNodeName', applyNodeNameChange);
    bindModalNameField('editOltName', applyOltNameChange);
    bindModalNameField('editSplitterName', applySplitterNameChange);
    bindModalNameField('editOnuName', applyOnuNameChange);
    bindModalNameField('editCameraName', applyCameraNameChange);
    bindModalNameField('editMediaConverterName', applyMediaConverterNameChange);
    bindModalNameField('editRadioBridgeName', applyRadioBridgeNameChange);
    bindModalNameField('editSupportName', applySupportNameChange);
    bindModalNameField('editSignalPostName', applySignalPostNameChange);
    var reserveEl = document.getElementById('editHostReserveM');
    if (reserveEl) {
        reserveEl.onchange = function() { applyHostReserveMChange(this.value); };
        reserveEl.onblur = function() { applyHostReserveMChange(this.value); };
    }
}

function flushCrossNameFromEditor() {
    flushNameFieldIfChanged('editCrossName', applyCrossNameChange);
}

function flushSleeveNameFromEditor() {
    flushNameFieldIfChanged('editSleeveName', applySleeveNameChange);
}

function flushCassetteNameFromEditor() {
    flushNameFieldIfChanged('editCassetteName', applyCassetteNameChange);
}

function flushNodeAttachedSwitchesFromEditor() {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
    var root = document.getElementById('modalInfo');
    if (!root) return;
    root.querySelectorAll('.edit-node-switch-name').forEach(function(inp) {
        var swId = inp.getAttribute('data-switch-id');
        if (swId) updateAttachedSwitchMeta(currentModalObject, swId, 'name', (inp.value || '').trim());
    });
    root.querySelectorAll('.edit-node-switch-comment').forEach(function(inp) {
        var swId = inp.getAttribute('data-switch-id');
        if (swId) updateAttachedSwitchMeta(currentModalObject, swId, 'comment', (inp.value || '').trim());
    });
    root.querySelectorAll('.edit-node-switch-port-label').forEach(function(inp) {
        var swId = inp.getAttribute('data-switch-id');
        var portNum = parseInt(inp.getAttribute('data-port'), 10);
        if (swId && !isNaN(portNum) && portNum >= 1) {
            setAttachedSwitchPortLabel(currentModalObject, swId, portNum, inp.value);
        }
    });
}

function flushModalNamesFromEditor() {
    if (!currentModalObject || !currentModalObject.properties) return;
    var t = currentModalObject.properties.get('type');
    if (t === 'cross') flushCrossNameFromEditor();
    else if (t === 'sleeve') flushSleeveNameFromEditor();
    else if (t === 'spliceCassette') flushCassetteNameFromEditor();
    else if (t === 'node') {
        flushNameFieldIfChanged('editNodeName', applyNodeNameChange);
        flushNodeAttachedSwitchesFromEditor();
    }
    else if (t === 'olt') flushNameFieldIfChanged('editOltName', applyOltNameChange);
    else if (t === 'splitter') flushNameFieldIfChanged('editSplitterName', applySplitterNameChange);
    else if (t === 'onu') flushNameFieldIfChanged('editOnuName', applyOnuNameChange);
    else if (t === 'camera') flushNameFieldIfChanged('editCameraName', applyCameraNameChange);
    else if (t === 'mediaConverter') flushNameFieldIfChanged('editMediaConverterName', applyMediaConverterNameChange);
    else if (t === 'radioBridge') flushNameFieldIfChanged('editRadioBridgeName', applyRadioBridgeNameChange);
    else if (t === 'support' || t === 'attachment' || t === 'manhole') flushNameFieldIfChanged('editSupportName', applySupportNameChange);
    else if (t === 'signalPost') {
        flushNameFieldIfChanged('editSignalPostName', applySignalPostNameChange);
        var spCommentEl = document.getElementById('editSignalPostComment');
        if (spCommentEl) currentModalObject.properties.set('comment', spCommentEl.value || '');
    }
    else if (t === 'cabinet' && typeof flushCabinetFieldsIfChanged === 'function') flushCabinetFieldsIfChanged();
}

function getObjectDefaultName(type) {
    switch(type) {
        case 'node': return 'Узел сети';
        case 'cross': return 'Кросс';
        case 'sleeve': return 'Муфта';
        case 'support': return 'Опора';
        case 'attachment': return 'Крепление';
        case 'manhole': return 'Колодец';
        case 'signalPost': return 'Столб';
        case 'cabinet': return 'Ящик';
        case 'olt': return 'OLT';
        case 'splitter': return 'Сплиттер';
        case 'onu': return 'ONU';
        case 'camera': return 'Камера';
        case 'mediaConverter': return 'Медиаконвертер';
        case 'radioBridge': return 'Wi‑Fi радиомост';
        case 'switch': return 'Коммутатор';
        default: return 'Объект';
    }
}

function getObjectLabelHtml(type, displayName, placemark) {
    if (type === 'camera' && window.CameraPlayer && placemark) {
        return CameraPlayer.buildMapLabelHtml(
            displayName,
            CameraPlayer.isCameraOnline(placemark),
            CameraPlayer.getCameraStatusTitle(placemark)
        );
    }
    return '<div class="map-label">' + displayName + '</div>';
}

function refreshCameraMapPresentation(cameraObj) {
    if (!cameraObj || !cameraObj.properties || cameraObj.properties.get('type') !== 'camera') return;
    var variant = 'normal';
    if (selectedObjects.indexOf(cameraObj) >= 0) {
        if (!isEditMode) variant = 'selected';
    }
    if (hoveredObject === cameraObj) variant = 'hover';
    applyMapPlacemarkIcon(cameraObj, 'camera', variant, cameraObj);
    updateObjectLabel(cameraObj, cameraObj.properties.get('name'));
    if (typeof refreshMapPlacemarkIcons === 'function' &&
        currentModalObject === cameraObj &&
        typeof isInfoModalVisible === 'function' &&
        isInfoModalVisible(document.getElementById('infoModal'))) {
        var modalBody = document.getElementById('modalInfo');
        if (modalBody && window.MapIcons && window.CameraPlayer) {
            var heroIcon = modalBody.querySelector('.camera-card-hero-icon');
            if (heroIcon) {
                heroIcon.innerHTML = MapIcons.buildIconSvg('camera', {
                    variant: 'normal',
                    cameraOnline: CameraPlayer.isCameraOnline(cameraObj)
                });
            }
            modalBody.querySelectorAll('.camera-status-badge').forEach(function(badge) {
                var online = CameraPlayer.isCameraOnline(cameraObj);
                badge.className = 'camera-status-badge camera-status-badge--' + (online ? 'online' : 'offline');
                badge.title = CameraPlayer.getCameraStatusTitle(cameraObj);
                var text = badge.querySelector('.camera-status-badge-text');
                if (text) text.textContent = online ? 'Онлайн' : 'Офлайн';
            });
        }
    }
}
window.refreshCameraMapPresentation = refreshCameraMapPresentation;

function isPlacemarkLabelTargetType(type) {
    return !!(type && type !== 'cable' && type !== 'cableLabel' && type !== 'region' && type !== 'regionLabel');
}

function updateObjectLabel(placemark, name) {
    if (!placemark || !placemark.properties) return;
    
    const type = placemark.properties.get('type');
    if (!isPlacemarkLabelTargetType(type)) return;
    
    let label = placemark.properties.get('label');
    const displayName = name ? escapeHtml(name) : getObjectDefaultName(type);
    const labelHtml = getObjectLabelHtml(type, displayName, placemark);
    const coords = placemark.geometry.getCoordinates();
    
    if (!label) {
        label = new ymaps.Placemark(coords, { iconContent: labelHtml }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContentOffset: type === 'support' ? [0, 14] : [0, 18],
            zIndex: 1000,
            zIndexHover: 1000,
            cursor: 'default',
            hasBalloon: false,
            hasHint: false
        });
        try {
            if (label.options && typeof label.options.unset === 'function') {
                label.options.unset('iconContent');
            }
        } catch (eUnset) {}
        placemark.properties.set('label', label);
    } else {
        try {
            if (label.options && typeof label.options.unset === 'function') {
                label.options.unset('iconContent');
            }
        } catch (eClr) {}
        label.properties.set({ iconContent: labelHtml });
        label.geometry.setCoordinates(coords);
    }
}

function updateSupportLabel(placemark, name) {
    updateObjectLabel(placemark, name);
}

function updateNodeIcon(placemark) {
    if (!placemark || !placemark.properties) return;
    if (placemark.properties.get('type') !== 'node') return;
    if (selectedObjects.indexOf(placemark) >= 0) {
        applyMapPlacemarkIcon(placemark, 'node', 'selected', placemark);
    } else {
        applyMapPlacemarkIcon(placemark, 'node', 'normal', placemark);
    }
}

var STATS_COLLAPSED_STORAGE_KEY = 'networkMap_statsCollapsed';

function setStatsSectionCollapsed(collapsed) {
    var section = document.getElementById('statsSection');
    var toggleBtn = document.getElementById('statsToggleBtn');
    if (!section) return;
    section.classList.toggle('stats-section--collapsed', collapsed);
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggleBtn.setAttribute('title', collapsed ? 'Показать статистику' : 'Скрыть статистику');
        toggleBtn.setAttribute('aria-label', collapsed ? 'Показать статистику' : 'Скрыть статистику');
    }
    try {
        localStorage.setItem(STATS_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch (e) {}
}

function setupStatsToggle() {
    var toggleBtn = document.getElementById('statsToggleBtn');
    var section = document.getElementById('statsSection');
    if (!toggleBtn || !section) return;

    var initiallyCollapsed = true;
    try {
        var stored = localStorage.getItem(STATS_COLLAPSED_STORAGE_KEY);
        if (stored === '0') initiallyCollapsed = false;
        else if (stored === '1') initiallyCollapsed = true;
    } catch (e) {}
    if (initiallyCollapsed) setStatsSectionCollapsed(true);

    toggleBtn.addEventListener('click', function() {
        setStatsSectionCollapsed(!section.classList.contains('stats-section--collapsed'));
    });
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    if (!toggleBtn) return;
    
    toggleBtn.addEventListener('click', function() {
        const body = document.body;
        const collapsed = body.classList.toggle('sidebar-collapsed');
        
        toggleBtn.setAttribute('aria-label', collapsed ? 'Показать панель' : 'Скрыть панель');
        toggleBtn.setAttribute('title', collapsed ? 'Показать панель' : 'Скрыть панель');
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

        if (typeof myMap !== 'undefined' && myMap && myMap.container) {
            setTimeout(function() {
                try {
                    myMap.container.fitToViewport();
                } catch (e) {}
            }, 300);
        }
    });
}

function setupModalEventListeners() {
    bindCableDeleteDelegation();

    var backToHostBtn = document.getElementById('back-to-host-from-splitter');
    if (backToHostBtn && currentModalObject && currentModalObject._host) {
        backToHostBtn.addEventListener('click', function() {
            showObjectInfo(currentModalObject._host);
        });
    }

    if (isEditMode) {
        document.querySelectorAll('.cable-type-select').forEach(select => {
            select.addEventListener('change', async function() {
                const cableUniqueId = this.getAttribute('data-cable-id');
                await changeCableType(cableUniqueId, this.value);
            });
        });

        document.querySelectorAll('.cable-fiber-count-input').forEach(function(inp) {
            inp.addEventListener('change', async function() {
                await changeCableType(inp.getAttribute('data-cable-id'), inp.value);
            });
        });

        document.querySelectorAll('.btn-cable-palette-edit').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var uid = btn.getAttribute('data-cable-id');
                var cableObj = objects.find(function(o) {
                    return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === uid;
                });
                if (!cableObj || !window.FiberCableConfig) return;
                window.FiberCableConfig.openFiberPaletteEditor({
                    title: 'Цвета жил кабеля',
                    fiberCount: getFiberCount(cableObj),
                    palette: window.FiberCableConfig.getFiberPaletteForCable(cableObj),
                    onSave: async function(r) {
                        await updateCableFiberSettings(uid, r.fiberCount, r.palette);
                    }
                });
            });
        });

        document.querySelectorAll('.fibers-list .fiber-item.fiber-used').forEach(item => {
            item.addEventListener('click', function(e) {
                if (e.target.closest('button, input, select, textarea, label, .fiber-port-row')) return;
                if (e.target.classList.contains('btn-continue-cable')) {
                    return;
                }
                const cableUniqueId = this.getAttribute('data-cable-id');
                const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
                toggleFiberUsage(cableUniqueId, fiberNumber);
            });
        });

        document.querySelectorAll('.btn-continue-cable').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const cableUniqueId = this.getAttribute('data-cable-id');
                const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));

                const modal = document.getElementById('infoModal');
                modal.style.display = 'none';

            });
        });
        
        document.querySelectorAll('.btn-copper-connect-from-media-converter').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'mediaConverter') return;
                startCopperCableFromMediaConverter(currentModalObject);
            });
        });
        document.querySelectorAll('.btn-copper-connect-from-node-port').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
                var swId = this.getAttribute('data-switch-id');
                var portN = parseInt(this.getAttribute('data-copper-port'), 10);
                startCopperCableFromNodeSwitchPort(currentModalObject, swId, portN);
            });
        });
        
    }

    setupFiberConnectionHandlers();
    if (typeof setupRadioBridgeCardHandlers === 'function') setupRadioBridgeCardHandlers();
    if (typeof setupCameraCoverageCardHandlers === 'function') setupCameraCoverageCardHandlers();

    document.querySelectorAll('.btn-trace-from-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const crossId = this.getAttribute('data-cross-id');
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            traceFromNode(crossId, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-trace-from-node-splitter').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var splitterId = this.getAttribute('data-splitter-id');
            var outputIndex = parseInt(this.getAttribute('data-output-index'), 10);
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            traceFromNodeSplitter(currentModalObject, splitterId, outputIndex);
        });
    });

    const modalInfo = document.getElementById('modalInfo');
    if (modalInfo) {
        modalInfo.querySelectorAll('.olt-port-label').forEach(function(input) {
            input.addEventListener('change', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                var portNum = parseInt(this.getAttribute('data-port'), 10);
                setOltPortLabel(currentModalObject, portNum, this.value);
                saveData();
            });
        });
        modalInfo.querySelectorAll('.olt-port-type').forEach(function(select) {
            select.addEventListener('change', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                var portNum = parseInt(this.getAttribute('data-port'), 10);
                if (typeof setOltPonPortType === 'function') setOltPonPortType(currentModalObject, portNum, this.value);
                saveData();
            });
        });
        modalInfo.querySelectorAll('.btn-olt-port-cable').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                var port = parseInt(this.getAttribute('data-port'), 10);
                if (typeof startOltPortFiberCable === 'function') startOltPortFiberCable(currentModalObject, port);
            });
        });
        modalInfo.querySelectorAll('.btn-olt-port-onu').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                var port = parseInt(this.getAttribute('data-port'), 10);
                if (typeof showOltPortOnuConnectDialog === 'function') {
                    showOltPortOnuConnectDialog(currentModalObject, port);
                }
            });
        });
        modalInfo.querySelectorAll('.btn-disconnect-olt-port').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                var port = parseInt(this.getAttribute('data-port'), 10);
                if (typeof disconnectOltPonPort === 'function') disconnectOltPonPort(currentModalObject, port);
                if (typeof refreshObjectModal === 'function') refreshObjectModal(currentModalObject);
            });
        });
        modalInfo.querySelectorAll('.btn-trace-olt-port').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const port = parseInt(this.getAttribute('data-port'), 10);
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                traceFromOLTPort(currentModalObject, port);
            });
        });

        modalInfo.querySelectorAll('.btn-splitter-output-to-host').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                showSplitterOutputHostDialog(currentModalObject, outIdx);
            });
        });
        modalInfo.querySelectorAll('.btn-splitter-output-to-onu').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                showSplitterOutputOnuDialog(currentModalObject, outIdx);
            });
        });
        modalInfo.querySelectorAll('.btn-splitter-output-to-splitter').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                showSplitterOutputSplitterDialog(currentModalObject, outIdx);
            });
        });

        modalInfo.querySelectorAll('.btn-splitter-output-delete').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                deleteSplitterOutput(currentModalObject, outIdx);
            });
        });

        modalInfo.querySelectorAll('.map-splitter-output-label-input').forEach(function(inp) {
            function saveMapSplitterOutLabel() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(inp.getAttribute('data-output-index'), 10);
                if (isNaN(outIdx) || typeof setSplitterOutputLabel !== 'function') return;
                setSplitterOutputLabel(null, getObjectUniqueId(currentModalObject), outIdx, inp.value.trim());
            }
            inp.addEventListener('change', saveMapSplitterOutLabel);
            inp.addEventListener('blur', saveMapSplitterOutLabel);
        });
    }
}
