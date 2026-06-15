/**
 * Панель выбора жилы для сращивания.
 */
function updateFiberSelectionUI() {
    const bar = document.getElementById('fiber-selection-bar');
    if (bar) {
        bar.style.display = selectedFiberForConnection ? 'block' : 'none';
        bar.innerHTML = '';
        if (selectedFiberForConnection) {
            const sc = selectedFiberForConnection;
            const shortId = sc.cableId.length > 10 ? sc.cableId.substring(0, 8) + '…' : sc.cableId;
            bar.className = 'fiber-selection-bar';
            var splitterHint = (schemeSplitterWirePick && schemeSplitterWirePick.hostObj && schemeSplitterWirePick.cableId === sc.cableId && schemeSplitterWirePick.fiberNumber === sc.fiberNumber)
                ? ' Или кликните <strong>сплиттер на схеме</strong> (карточка или «вх») для подключения входа.'
                : '';
            bar.innerHTML = '<span class="fiber-selection-text">Выбрана жила: кабель ' + escapeHtml(shortId) + ', жила ' + sc.fiberNumber + '. Выберите вторую жилу в другом кабеле (в таблице или в схеме).' + splitterHint + '</span> ' +
                '<button type="button" class="fiber-selection-cancel" id="fiberSelectionCancelBtn">Отменить выбор</button>';
            const cancelBtn = document.getElementById('fiberSelectionCancelBtn');
            if (cancelBtn) cancelBtn.addEventListener('click', function() { resetFiberSelection(); });
        }
    }
    document.querySelectorAll('.fiber-connections-container .fiber-item.fiber-selected').forEach(function(el) { el.classList.remove('fiber-selected'); });
    if (selectedFiberForConnection) {
        const sel = selectedFiberForConnection;
        document.querySelectorAll('.fiber-connections-container .fiber-item').forEach(function(el) {
            if (el.getAttribute('data-cable-id') === sel.cableId && parseInt(el.getAttribute('data-fiber-number'), 10) === sel.fiberNumber) el.classList.add('fiber-selected');
        });
    }
    document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]').forEach(function(el) {
        const rect = el.querySelector && el.querySelector('rect');
        const target = rect || el;
        const isUsed = el.getAttribute('data-fiber-used') === 'true';
        const isConnected = el.getAttribute('data-fiber-connected') === 'true';
        const cId = el.getAttribute('data-cable-id');
        const fNum = el.getAttribute('data-fiber-number');
        const isSelected = selectedFiberForConnection && selectedFiberForConnection.cableId === cId && selectedFiberForConnection.fiberNumber === parseInt(fNum, 10);
        if (isSelected) {
            target.setAttribute('stroke', '#f59e0b');
            target.setAttribute('stroke-width', '3');
        } else if (isConnected) {
            target.setAttribute('stroke', '#3b82f6');
            target.setAttribute('stroke-width', '3');
        } else if (isUsed) {
            target.setAttribute('stroke', '#dc2626');
            target.setAttribute('stroke-width', '2');
        } else {
            target.setAttribute('stroke', '#333');
            target.setAttribute('stroke-width', '1');
        }
    });
    const hint = document.querySelector('.connection-hint');
    if (hint) hint.remove();
}

function resetFiberSelection() {
    selectedFiberForConnection = null;
    if (schemeSplitterWirePick && schemeSplitterWirePick.cableId && !schemeSplitterWirePick.splitterId) {
        schemeSplitterWirePick = null;
        updateSchemeSplitterPickUI();
    }
    updateFiberSelectionUI();
}

function getCableOltImpact(cableUniqueId) {
    var oltImpact = { ports: 0, incoming: 0 };
    objects.forEach(function(o) {
        if (!o.properties || o.properties.get('type') !== 'olt') return;
        var pa = o.properties.get('portAssignments') || {};
        Object.keys(pa).forEach(function(pk) {
            var a = pa[pk];
            if (a && a.cableId === cableUniqueId) oltImpact.ports++;
        });
        var incoming = o.properties.get('incomingFiber');
        if (incoming && incoming.cableId === cableUniqueId) oltImpact.incoming++;
    });
    return oltImpact;
}

