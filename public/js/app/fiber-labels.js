/**
 * Подписи жил и сращиваний на схеме.
 */
function resolveFiberConnectionLabel(conn, fiberLabels) {
    if (!conn) return '';
    if (conn.label) return String(conn.label);
    const fiberLabelsMap = fiberLabels || {};
    const fromKey = conn.from.cableId + '-' + conn.from.fiberNumber;
    const toKey = conn.to.cableId + '-' + conn.to.fiberNumber;
    const fromL = fiberLabelsMap[fromKey];
    const toL = fiberLabelsMap[toKey];
    if (fromL && toL && fromL !== toL) return fromL + ' / ' + toL;
    return fromL || toL || '';
}

/** Перенос подписей с жил на объекты сращиваний (старые данные). */
function syncFiberConnectionLabelsFromLegacy(sleeveObj) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    const fiberLabels = sleeveObj.properties.get('fiberLabels') || {};
    let changed = false;
    fiberConnections.forEach(function(conn) {
        if (conn.label) return;
        const fromKey = conn.from.cableId + '-' + conn.from.fiberNumber;
        const toKey = conn.to.cableId + '-' + conn.to.fiberNumber;
        const fromL = fiberLabels[fromKey];
        const toL = fiberLabels[toKey];
        let label = '';
        if (fromL && toL && fromL !== toL) label = fromL + ' / ' + toL;
        else label = fromL || toL || '';
        if (!label) return;
        conn.label = label;
        delete fiberLabels[fromKey];
        delete fiberLabels[toKey];
        changed = true;
    });
    if (changed) {
        sleeveObj.properties.set('fiberConnections', fiberConnections);
        sleeveObj.properties.set('fiberLabels', fiberLabels);
    }
}

function syncFiberConnectionLabelInputs(connIndex, label) {
    const v = label || '';
    const bar = document.getElementById('fiber-conn-label-bar-input');
    if (bar && parseInt(bar.getAttribute('data-connection-index'), 10) === connIndex && document.activeElement !== bar) {
        bar.value = v;
    }
    document.querySelectorAll('.fiber-connection-label-input[data-connection-index="' + connIndex + '"]').forEach(function(inp) {
        if (document.activeElement !== inp) inp.value = v;
    });
}

function getFiberSchemeLabelColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        bg: isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        fill: isDark ? '#f1f5f9' : '#1e293b',
        border: isDark ? '#334155' : '#dee2e6'
    };
}

function setSvgTitle(parent, text) {
    if (!parent) return;
    let titleEl = parent.querySelector('title');
    const trimmed = text ? String(text).trim() : '';
    if (!trimmed) {
        if (titleEl) titleEl.remove();
        return;
    }
    if (!titleEl) {
        titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        parent.appendChild(titleEl);
    }
    titleEl.textContent = trimmed;
}

function refreshFiberSchemeConnectionLabelDom(connIndex, labelText) {
    const svg = document.getElementById('fiber-connections-svg');
    if (!svg || connIndex == null || isNaN(connIndex)) return;
    const trimmed = labelText ? String(labelText).trim() : '';
    const link = svg.querySelector('#connection-' + connIndex) || svg.querySelector('.fiber-scheme-link[data-connection-index="' + connIndex + '"]');
    const linkHit = svg.querySelector('.fiber-scheme-link-hit[data-connection-index="' + connIndex + '"]');
    if (link) {
        link.setAttribute('data-conn-label', trimmed);
        setSvgTitle(link, trimmed);
    }
    setSvgTitle(linkHit, trimmed);

    let labelG = svg.querySelector('.fiber-scheme-conn-label[data-connection-index="' + connIndex + '"]');
    if (!trimmed) {
        if (labelG) labelG.remove();
        return;
    }
    if (!link) return;
    const pathD = link.getAttribute('d');
    if (!pathD) return;
    const mid = fiberSchemePathMidpoint(pathD);
    const colors = getFiberSchemeLabelColors();
    const labelFoW = 148;
    const tw = Math.min(labelFoW, Math.max(40, trimmed.length * 6.5 + 16));
    const tx = mid.x - tw / 2;
    const ty = mid.y - 11;

    if (!labelG) {
        const container = svg.querySelector('.fiber-scheme-link-labels');
        if (!container) return;
        labelG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelG.setAttribute('class', 'fiber-scheme-conn-label');
        labelG.setAttribute('data-connection-index', String(connIndex));
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'fiber-scheme-conn-label-bg');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'fiber-scheme-conn-label-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'font-size: 10px; font-weight: 600; fill: ' + colors.fill + '; pointer-events: none;');
        labelG.appendChild(rect);
        labelG.appendChild(text);
        container.appendChild(labelG);
    }
    const rect = labelG.querySelector('.fiber-scheme-conn-label-bg');
    const text = labelG.querySelector('.fiber-scheme-conn-label-text');
    if (rect) {
        rect.setAttribute('x', String(tx));
        rect.setAttribute('y', String(ty));
        rect.setAttribute('width', String(tw));
        rect.setAttribute('height', '21');
        rect.setAttribute('rx', '5');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '0.75');
    }
    if (text) {
        text.setAttribute('x', String(mid.x));
        text.setAttribute('y', String(mid.y + 5));
        text.textContent = trimmed;
    }
    const linkHovered = link && link.classList.contains('fiber-scheme-link-hovered');
    if (selectedFiberConnectionIndex === connIndex || linkHovered || labelG.classList.contains('is-visible')) {
        labelG.classList.add('is-visible');
    }
}

function refreshFiberSchemeFiberLabelDom(fiberKey, labelText) {
    const svg = document.getElementById('fiber-connections-svg');
    if (!svg || !fiberKey) return;
    const trimmed = labelText ? String(labelText).trim() : '';
    const port = svg.querySelector('#fiber-' + fiberKey) || svg.querySelector('.fiber-scheme-port[data-fiber-key="' + fiberKey + '"]');
    if (port) {
        if (trimmed) port.setAttribute('data-direct-label', trimmed);
        else port.removeAttribute('data-direct-label');
    }
    let labelG = svg.querySelector('.fiber-scheme-fiber-label[data-fiber-key="' + fiberKey + '"]');
    if (!trimmed) {
        if (labelG) labelG.remove();
        return;
    }
    const lastDash = fiberKey.lastIndexOf('-');
    const fiberNumber = lastDash >= 0 ? fiberKey.slice(lastDash + 1) : '';
    const cableId = lastDash >= 0 ? fiberKey.slice(0, lastDash) : fiberKey;
    const portEl = port || svg.querySelector('.fiber-scheme-port[data-cable-id="' + cableId + '"][data-fiber-number="' + fiberNumber + '"]');
    if (!portEl) return;
    const badge = portEl.querySelector('.fiber-port-badge');
    if (!badge) return;
    const bx = parseFloat(badge.getAttribute('x')) || 0;
    const by = parseFloat(badge.getAttribute('y')) || 0;
    const bw = parseFloat(badge.getAttribute('width')) || 22;
    const bh = parseFloat(badge.getAttribute('height')) || 16;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const colors = getFiberSchemeLabelColors();
    const tw = Math.min(120, Math.max(36, trimmed.length * 6.5 + 14));
    const tx = cx - tw / 2;
    const ty = cy - 22;
    if (!labelG) {
        const container = svg.querySelector('.fiber-scheme-fiber-labels');
        if (!container) return;
        labelG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelG.setAttribute('class', 'fiber-scheme-fiber-label');
        labelG.setAttribute('data-fiber-key', fiberKey);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'fiber-scheme-fiber-label-bg');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'fiber-scheme-fiber-label-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'font-size: 9px; font-weight: 600; fill: ' + colors.fill + '; pointer-events: none;');
        labelG.appendChild(rect);
        labelG.appendChild(text);
        container.appendChild(labelG);
    }
    const rect = labelG.querySelector('.fiber-scheme-fiber-label-bg');
    const text = labelG.querySelector('.fiber-scheme-fiber-label-text');
    if (rect) {
        rect.setAttribute('x', String(tx));
        rect.setAttribute('y', String(ty));
        rect.setAttribute('width', String(tw));
        rect.setAttribute('height', '18');
        rect.setAttribute('rx', '4');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '0.75');
    }
    if (text) {
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(ty + 13));
        text.textContent = trimmed;
    }
    if (labelG.classList.contains('is-visible')) {
        labelG.classList.add('is-visible');
    }
}

function updateFiberConnectionLabel(sleeveObj, connIndex, label) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    if (connIndex < 0 || connIndex >= fiberConnections.length) return;
    const conn = fiberConnections[connIndex];
    const trimmed = label ? String(label).trim() : '';
    if (trimmed) conn.label = trimmed;
    else delete conn.label;
    const fiberLabels = sleeveObj.properties.get('fiberLabels') || {};
    const fromKey = conn.from.cableId + '-' + conn.from.fiberNumber;
    const toKey = conn.to.cableId + '-' + conn.to.fiberNumber;
    delete fiberLabels[fromKey];
    delete fiberLabels[toKey];
    sleeveObj.properties.set('fiberConnections', fiberConnections);
    sleeveObj.properties.set('fiberLabels', fiberLabels);
    saveData();
    syncFiberConnectionLabelInputs(connIndex, trimmed);
    refreshFiberSchemeConnectionLabelDom(connIndex, trimmed);
    const row = document.querySelector('.fiber-connection-row[data-connection-index="' + connIndex + '"]');
    if (row) {
        const fromEl = row.querySelector('.fiber-conn-from');
        const toEl = row.querySelector('.fiber-conn-to');
        if (fromEl && toEl) {
            row.setAttribute('data-search', (fromEl.textContent + ' ' + toEl.textContent + ' ' + trimmed).toLowerCase());
        }
    }
}

function formatFiberConnectionDesc(conn, cableNameById) {
    if (!conn) return '';
    const fromName = cableNameById ? cableNameById(conn.from.cableId) : conn.from.cableId;
    const toName = cableNameById ? cableNameById(conn.to.cableId) : conn.to.cableId;
    return fromName + ', ж.' + conn.from.fiberNumber + ' ↔ ' + toName + ', ж.' + conn.to.fiberNumber;
}

var selectedSplitterLink = null;

function parseSplitterLinkMeta(linkEl) {
    if (!linkEl) return null;
    var kind = linkEl.getAttribute('data-link-kind');
    var splitterId = linkEl.getAttribute('data-splitter-id');
    if (!kind || !splitterId) return null;
    var meta = {
        kind: kind,
        splitterId: splitterId,
        linkKey: linkEl.getAttribute('data-link-key')
    };
    if (kind === 'output') {
        meta.outputIndex = parseInt(linkEl.getAttribute('data-output-index'), 10);
        var targetSplitterId = linkEl.getAttribute('data-target-splitter-id');
        if (targetSplitterId) meta.targetSplitterId = targetSplitterId;
    }
    var cableId = linkEl.getAttribute('data-cable-id');
    var fiberNumber = parseInt(linkEl.getAttribute('data-fiber-number'), 10);
    if (cableId) meta.cableId = cableId;
    if (!isNaN(fiberNumber)) meta.fiberNumber = fiberNumber;
    return meta;
}

function getSplitterLinkLabel(hostObj, linkMeta) {
    if (!hostObj || !linkMeta) return '';
    if (linkMeta.kind === 'input' && linkMeta.cableId && linkMeta.fiberNumber != null) {
        var sc = hostObj.properties.get('splitterConnections') || {};
        var key = fiberConnKey(linkMeta.cableId, linkMeta.fiberNumber);
        return (sc[key] && sc[key].label) ? String(sc[key].label) : '';
    }
    if (linkMeta.kind === 'output' && window.EmbeddedSplitters) {
        var rec = EmbeddedSplitters.findInHost(hostObj, linkMeta.splitterId);
        var outs = rec ? (rec.outputConnections || []) : [];
        var out = outs[linkMeta.outputIndex];
        return (out && out.label) ? String(out.label) : '';
    }
    return '';
}

function updateSplitterLinkLabel(hostObj, linkMeta, label) {
    if (!hostObj || !linkMeta) return;
    var trimmed = label ? String(label).trim() : '';
    if (linkMeta.kind === 'input' && linkMeta.cableId && linkMeta.fiberNumber != null) {
        var sc = hostObj.properties.get('splitterConnections') || {};
        var key = fiberConnKey(linkMeta.cableId, linkMeta.fiberNumber);
        if (!sc[key]) return;
        if (trimmed) sc[key].label = trimmed;
        else delete sc[key].label;
        hostObj.properties.set('splitterConnections', sc);
    } else if (linkMeta.kind === 'output' && window.EmbeddedSplitters) {
        var rec = EmbeddedSplitters.findInHost(hostObj, linkMeta.splitterId);
        if (!rec) return;
        var outs = rec.outputConnections || [];
        var out = outs[linkMeta.outputIndex];
        if (!out) return;
        if (trimmed) out.label = trimmed;
        else delete out.label;
    } else return;
    saveData();
    refreshSplitterLinkLabelDom(linkMeta.linkKey, trimmed);
}

function formatSplitterLinkDesc(hostObj, linkMeta, cableNameById) {
    if (!linkMeta) return '';
    var spName = window.EmbeddedSplitters ? (EmbeddedSplitters.resolveName(linkMeta.splitterId) || 'Сплиттер') : 'Сплиттер';
    var cableName = linkMeta.cableId && cableNameById ? cableNameById(linkMeta.cableId) : (linkMeta.cableId || '');
    var fiberNum = linkMeta.fiberNumber != null ? linkMeta.fiberNumber : '?';
    if (linkMeta.kind === 'input') {
        return cableName + ', ж.' + fiberNum + ' → ' + spName + ' (вход)';
    }
    if (linkMeta.targetSplitterId) {
        var tgtName = window.EmbeddedSplitters ? (EmbeddedSplitters.resolveName(linkMeta.targetSplitterId) || 'Сплиттер') : 'Сплиттер';
        return spName + ' вых.' + ((linkMeta.outputIndex || 0) + 1) + ' → ' + tgtName + ' (вход)';
    }
    return spName + ' вых.' + ((linkMeta.outputIndex || 0) + 1) + ' → ' + cableName + ', ж.' + fiberNum;
}

function refreshSplitterLinkLabelDom(linkKey, labelText) {
    var svg = document.getElementById('fiber-connections-svg');
    if (!svg || !linkKey) return;
    var trimmed = labelText ? String(labelText).trim() : '';
    var link = svg.querySelector('.fiber-scheme-splitter-link[data-link-key="' + linkKey + '"]');
    var linkHit = svg.querySelector('.fiber-scheme-splitter-link-hit[data-link-key="' + linkKey + '"]');
    if (link) {
        link.setAttribute('data-conn-label', trimmed);
        setSvgTitle(link, trimmed);
    }
    setSvgTitle(linkHit, trimmed);
    var labelG = svg.querySelector('.fiber-scheme-splitter-conn-label[data-link-key="' + linkKey + '"]');
    if (!trimmed) {
        if (labelG) labelG.remove();
        return;
    }
    if (!link) return;
    var pathD = link.getAttribute('d');
    if (!pathD) return;
    var mid = fiberSchemePathMidpoint(pathD);
    var colors = getFiberSchemeLabelColors();
    var tw = Math.min(148, Math.max(40, trimmed.length * 6.5 + 16));
    var tx = mid.x - tw / 2;
    if (!labelG) {
        var container = svg.querySelector('.fiber-scheme-splitter-link-labels');
        if (!container) return;
        labelG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelG.setAttribute('class', 'fiber-scheme-splitter-conn-label');
        labelG.setAttribute('data-link-key', linkKey);
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'fiber-scheme-splitter-conn-label-bg');
        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'fiber-scheme-splitter-conn-label-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'font-size: 10px; font-weight: 600; fill: ' + colors.fill + '; pointer-events: none;');
        labelG.appendChild(rect);
        labelG.appendChild(text);
        container.appendChild(labelG);
    }
    var rect = labelG.querySelector('.fiber-scheme-splitter-conn-label-bg');
    var text = labelG.querySelector('.fiber-scheme-splitter-conn-label-text');
    if (rect) {
        rect.setAttribute('x', String(tx));
        rect.setAttribute('y', String(mid.y - 11));
        rect.setAttribute('width', String(tw));
        rect.setAttribute('height', '21');
        rect.setAttribute('rx', '5');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '0.75');
    }
    if (text) {
        text.setAttribute('x', String(mid.x));
        text.setAttribute('y', String(mid.y + 5));
        text.textContent = trimmed;
    }
    if (selectedSplitterLink && selectedSplitterLink.linkKey === linkKey) {
        labelG.classList.add('is-visible');
    }
}

function selectSplitterLinkForLabel(hostObj, linkMeta, opts) {
    opts = opts || {};
    if (!linkMeta || !linkMeta.linkKey) return;
    selectedFiberConnectionIndex = null;
    selectedSplitterLink = linkMeta;
    function cableNameById(id) {
        const cables = getConnectedCables(hostObj);
        const c = cables.find(function(x) { return x.properties && x.properties.get('uniqueId') === id; });
        if (!c) return id.substring(0, 8) + '…';
        const n = c.properties.get('cableName');
        return n || getCableDescription(c.properties.get('cableType'));
    }
    var desc = formatSplitterLinkDesc(hostObj, linkMeta, cableNameById);
    var label = getSplitterLinkLabel(hostObj, linkMeta);
    var bar = document.getElementById('fiber-conn-label-bar');
    var titleEl = document.getElementById('fiber-conn-label-modal-title');
    var descEl = document.getElementById('fiber-conn-label-bar-desc');
    var inputEl = document.getElementById('fiber-conn-label-bar-input');
    var gotoBtn = document.getElementById('fiber-conn-label-bar-goto');
    var deleteBtn = document.getElementById('fiber-conn-label-bar-delete');
    if (bar) {
        bar.hidden = false;
        bar.setAttribute('aria-hidden', 'false');
    }
    if (titleEl) titleEl.textContent = 'Подпись соединения сплиттера';
    if (descEl) descEl.textContent = desc;
    if (gotoBtn) gotoBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.textContent = 'Удалить соединение';
    if (inputEl) {
        inputEl.value = label || '';
        inputEl.setAttribute('data-link-mode', 'splitter');
        inputEl.setAttribute('data-link-key', linkMeta.linkKey);
        inputEl.removeAttribute('data-connection-index');
        if (opts.focusInput) {
            try { inputEl.focus(); inputEl.select(); } catch (e) {}
        }
    }
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-link-selected, #fiber-connections-svg .fiber-scheme-splitter-link-selected').forEach(function(el) {
        el.classList.remove('fiber-scheme-link-selected', 'fiber-scheme-splitter-link-selected');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-link, #fiber-connections-svg .fiber-scheme-splitter-link-hit').forEach(function(el) {
        el.classList.toggle('fiber-scheme-splitter-link-selected', el.getAttribute('data-link-key') === linkMeta.linkKey);
    });
    document.querySelectorAll('.fiber-scheme-splitter-conn-label').forEach(function(el) {
        el.classList.toggle('is-visible', el.getAttribute('data-link-key') === linkMeta.linkKey);
    });
}

function deleteSplitterLink(hostObj, linkMeta) {
    if (!hostObj || !linkMeta) return;
    clearFiberConnectionLabelSelection();
    if (linkMeta.kind === 'input' && linkMeta.cableId && linkMeta.fiberNumber != null) {
        disconnectFiberFromSplitter(hostObj, linkMeta.cableId, linkMeta.fiberNumber);
        return;
    }
    if (linkMeta.kind === 'output' && linkMeta.splitterId != null && linkMeta.outputIndex != null) {
        var facade = resolveSplitterObject(linkMeta.splitterId);
        if (facade) deleteSplitterOutput(facade, linkMeta.outputIndex);
    }
}

function closeFiberConnLabelModal(sleeveObj, save, keepSelection) {
    if (save) {
        var inp = document.getElementById('fiber-conn-label-bar-input');
        if (inp) {
            var mode = inp.getAttribute('data-link-mode') || 'splice';
            if (mode === 'splitter') {
                var linkKey = inp.getAttribute('data-link-key');
                if (linkKey && selectedSplitterLink) {
                    updateSplitterLinkLabel(sleeveObj, selectedSplitterLink, inp.value.trim());
                }
            } else {
                var connIndex = parseInt(inp.getAttribute('data-connection-index'), 10);
                if (!isNaN(connIndex)) updateFiberConnectionLabel(sleeveObj, connIndex, inp.value.trim());
            }
        }
    }
    if (keepSelection) {
        var bar = document.getElementById('fiber-conn-label-bar');
        if (bar) {
            bar.hidden = true;
            bar.setAttribute('aria-hidden', 'true');
        }
    } else {
        clearFiberConnectionLabelSelection();
    }
}

function clearFiberConnectionLabelSelection() {
    selectedFiberConnectionIndex = null;
    selectedSplitterLink = null;
    var bar = document.getElementById('fiber-conn-label-bar');
    if (bar) {
        bar.hidden = true;
        bar.setAttribute('aria-hidden', 'true');
    }
    var titleEl = document.getElementById('fiber-conn-label-modal-title');
    var gotoBtn = document.getElementById('fiber-conn-label-bar-goto');
    var deleteBtn = document.getElementById('fiber-conn-label-bar-delete');
    var inputEl = document.getElementById('fiber-conn-label-bar-input');
    if (titleEl) titleEl.textContent = 'Подпись сращивания';
    if (gotoBtn) gotoBtn.style.display = '';
    if (deleteBtn) deleteBtn.textContent = 'Удалить сращивание';
    if (inputEl) {
        inputEl.setAttribute('data-link-mode', 'splice');
        inputEl.removeAttribute('data-link-key');
    }
    document.querySelectorAll('.fiber-connection-row.fiber-connection-row--selected').forEach(function(el) {
        el.classList.remove('fiber-connection-row--selected');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-link-selected').forEach(function(el) {
        el.classList.remove('fiber-scheme-link-selected');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-link-selected').forEach(function(el) {
        el.classList.remove('fiber-scheme-splitter-link-selected');
    });
    document.querySelectorAll('.fiber-scheme-conn-label.is-visible, .fiber-scheme-fiber-label.is-visible, .fiber-scheme-splitter-conn-label.is-visible').forEach(function(el) {
        el.classList.remove('is-visible');
    });
}

function selectFiberConnectionForLabel(sleeveObj, connIndex, opts) {
    opts = opts || {};
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    if (connIndex < 0 || connIndex >= fiberConnections.length) return;
    selectedFiberConnectionIndex = connIndex;
    selectedSplitterLink = null;
    const conn = fiberConnections[connIndex];

    function cableNameById(id) {
        const cables = getConnectedCables(sleeveObj);
        const c = cables.find(function(x) { return x.properties && x.properties.get('uniqueId') === id; });
        if (!c) return id.substring(0, 8) + '…';
        const n = c.properties.get('cableName');
        return n || getCableDescription(c.properties.get('cableType'));
    }

    const desc = formatFiberConnectionDesc(conn, cableNameById);
    const label = resolveFiberConnectionLabel(conn, sleeveObj.properties.get('fiberLabels') || {});

    var bar = document.getElementById('fiber-conn-label-bar');
    var titleEl = document.getElementById('fiber-conn-label-modal-title');
    var descEl = document.getElementById('fiber-conn-label-bar-desc');
    var inputEl = document.getElementById('fiber-conn-label-bar-input');
    var gotoBtn = document.getElementById('fiber-conn-label-bar-goto');
    var deleteBtn = document.getElementById('fiber-conn-label-bar-delete');
    if (bar) {
        bar.hidden = false;
        bar.setAttribute('aria-hidden', 'false');
    }
    if (titleEl) titleEl.textContent = 'Подпись сращивания';
    if (descEl) descEl.textContent = desc;
    if (gotoBtn) gotoBtn.style.display = '';
    if (deleteBtn) deleteBtn.textContent = 'Удалить сращивание';
    if (inputEl) {
        inputEl.value = label || '';
        inputEl.setAttribute('data-connection-index', String(connIndex));
        inputEl.setAttribute('data-link-mode', 'splice');
        inputEl.removeAttribute('data-link-key');
        if (opts.focusInput) {
            try { inputEl.focus(); inputEl.select(); } catch (e) {}
        }
    }

    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-link-selected').forEach(function(el) {
        el.classList.remove('fiber-scheme-splitter-link-selected');
    });
    document.querySelectorAll('.fiber-scheme-splitter-conn-label.is-visible').forEach(function(el) {
        el.classList.remove('is-visible');
    });

    document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
        var on = row.getAttribute('data-connection-index') === String(connIndex);
        row.classList.toggle('fiber-connection-row--selected', on);
        if (on && opts.scrollToRow) {
            try { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(false); }
        }
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-link, #fiber-connections-svg .fiber-scheme-link-hit').forEach(function(el) {
        el.classList.toggle('fiber-scheme-link-selected', el.getAttribute('data-connection-index') === String(connIndex));
    });
    document.querySelectorAll('.fiber-scheme-conn-label').forEach(function(el) {
        el.classList.toggle('is-visible', el.getAttribute('data-connection-index') === String(connIndex));
    });
}

function deleteFiberConnectionByIndex(sleeveObj, connIndex) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    if (connIndex < 0 || connIndex >= fiberConnections.length) return;
    fiberConnections.splice(connIndex, 1);
    sleeveObj.properties.set('fiberConnections', fiberConnections);
    clearFiberConnectionLabelSelection();
    saveData();
    cleanupGponAssignmentsWithoutOlt();
    savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
    showObjectInfo(sleeveObj);
}

function fiberSchemePathMidpoint(pathD) {
    const m = pathD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+C\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+)/);
    if (!m) return { x: 0, y: 0 };
    const p0 = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    const p1 = { x: parseFloat(m[3]), y: parseFloat(m[4]) };
    const p2 = { x: parseFloat(m[5]), y: parseFloat(m[6]) };
    const p3 = { x: parseFloat(m[7]), y: parseFloat(m[8]) };
    const t = 0.5;
    const u = 1 - t;
    return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
}

function updateFiberPort(crossObj, cableId, fiberNumber, portValue) {
    let fiberPorts = crossObj.properties.get('fiberPorts');
    if (!fiberPorts) {
        fiberPorts = {};
        crossObj.properties.set('fiberPorts', fiberPorts);
    }
    const key = `${cableId}-${fiberNumber}`;
    const value = (portValue !== undefined && portValue !== null && String(portValue).trim() !== '') ? String(portValue).trim() : null;
    if (value) {
        fiberPorts[key] = value;
    } else {
        delete fiberPorts[key];
    }
    crossObj.properties.set('fiberPorts', fiberPorts);
}

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
    refreshFiberSchemeFiberLabelDom(key, label ? String(label).trim() : '');
}
