/**
 * Обработчики сращивания жил в модалке кросса/муфты.
 */
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

    selectedFiberForConnection = null;
    selectedFiberConnectionIndex = null;

    document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            if (this.getAttribute('data-fiber-selectable') === 'false') return;
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'), 10);

            if (schemeSplitterWirePick && schemeSplitterWirePick.hostObj === sleeveObj && schemeSplitterWirePick.splitterId) {
                if (tryConnectSchemeFiberToSplitter(sleeveObj, cableId, fiberNumber, schemeSplitterWirePick.splitterId)) return;
            }
            if (schemeSplitterOutputPick && schemeSplitterOutputPick.hostObj === sleeveObj) {
                tryConnectSchemeSplitterOutputToFiber(sleeveObj, cableId, fiberNumber);
                return;
            }

            if (!selectedFiberForConnection) {
                
                const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                const onuConnections = sleeveObj.properties.get('onuConnections') || {};
                const mediaConverterConnections = sleeveObj.properties.get('mediaConverterConnections') || {};
                const splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
                const fiberKey = `${cableId}-${fiberNumber}`;
                
                if (nodeConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к узлу "${nodeConnections[fiberKey].nodeName}". Отключите её от узла, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                if (onuConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к ONU "${onuConnections[fiberKey].onuName || 'ONU'}". Отключите её от ONU, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                if (mediaConverterConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к медиаконвертеру "${mediaConverterConnections[fiberKey].mediaConverterName || 'Медиаконвертер'}". Отключите её, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                if (splitterConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к сплиттеру. Отключите её от сплиттера, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                const fiberAlreadyConnected = fiberConnections.find(conn => 
                    (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                    (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
                );
                
                if (fiberAlreadyConnected) {
                    
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

                selectedFiberForConnection = { cableId, fiberNumber };
                startSchemeSplitterFiberWirePick(sleeveObj, cableId, fiberNumber);
                updateFiberSelectionUI();
            } else {
                if (selectedFiberForConnection.cableId === cableId && selectedFiberForConnection.fiberNumber === fiberNumber) {
                    resetFiberSelection();
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                    }
                    return;
                }
                
                if (selectedFiberForConnection.cableId !== cableId || selectedFiberForConnection.fiberNumber !== fiberNumber) {
                    
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

                    const existingConn = fiberConnections.find(conn => 
                        (conn.from.cableId === selectedFiberForConnection.cableId && conn.from.fiberNumber === selectedFiberForConnection.fiberNumber &&
                         conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) ||
                        (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber &&
                         conn.to.cableId === selectedFiberForConnection.cableId && conn.to.fiberNumber === selectedFiberForConnection.fiberNumber)
                    );

                    const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                    const onuConnections = sleeveObj.properties.get('onuConnections') || {};
                    const mediaConverterConnections = sleeveObj.properties.get('mediaConverterConnections') || {};
                    const splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
                    const secondKey = `${cableId}-${fiberNumber}`;
                    const firstKey = `${selectedFiberForConnection.cableId}-${selectedFiberForConnection.fiberNumber}`;
                    
                    if (nodeConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к узлу "${nodeConnections[secondKey].nodeName}". Отключите её от узла, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (onuConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к ONU "${onuConnections[secondKey].onuName || 'ONU'}". Отключите её от ONU, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (mediaConverterConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к медиаконвертеру "${mediaConverterConnections[secondKey].mediaConverterName || 'Медиаконвертер'}". Отключите её, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (splitterConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к сплиттеру. Отключите её от сплиттера, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (nodeConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к узлу "${nodeConnections[firstKey].nodeName}". Отключите её от узла для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (onuConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к ONU "${onuConnections[firstKey].onuName || 'ONU'}". Отключите её от ONU для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (mediaConverterConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к медиаконвертеру "${mediaConverterConnections[firstKey].mediaConverterName || 'Медиаконвертер'}". Отключите её для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (splitterConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к сплиттеру. Отключите её от сплиттера для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    const firstFiberAlreadyConnected = fiberConnections.find(conn => 
                        (conn.from.cableId === selectedFiberForConnection.cableId && conn.from.fiberNumber === selectedFiberForConnection.fiberNumber) ||
                        (conn.to.cableId === selectedFiberForConnection.cableId && conn.to.fiberNumber === selectedFiberForConnection.fiberNumber)
                    );

                    const secondFiberAlreadyConnected = fiberConnections.find(conn => 
                        (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                        (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
                    );
                    
                    if (firstFiberAlreadyConnected) {
                        
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
                        var spliceConflict = getSpliceAssignmentConflict(
                            sleeveObj,
                            selectedFiberForConnection.cableId,
                            selectedFiberForConnection.fiberNumber,
                            cableId,
                            fiberNumber
                        );
                        if (spliceConflict) {
                            var instructionConflict = document.querySelector('.fiber-connections-container');
                            if (instructionConflict) {
                                var existingMsgConflict = instructionConflict.querySelector('.connection-hint');
                                if (existingMsgConflict) existingMsgConflict.remove();
                                var hintConflict = document.createElement('div');
                                hintConflict.className = 'connection-hint';
                                hintConflict.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                                hintConflict.textContent = 'Нельзя сращить: на жилах разные назначения (' + spliceConflict.label + '). Сначала согласуйте подключения.';
                                instructionConflict.appendChild(hintConflict);
                            }
                            resetFiberSelection();
                            return;
                        }
                        fiberConnections.push({
                            from: { cableId: selectedFiberForConnection.cableId, fiberNumber: selectedFiberForConnection.fiberNumber },
                            to: { cableId: cableId, fiberNumber: fiberNumber }
                        });
                        sleeveObj.properties.set('fiberConnections', fiberConnections);
                        saveData();

                        savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
                        showObjectInfo(sleeveObj);
                        return;
                    }
                }

                resetFiberSelection();
            }
        });
    });

    document.querySelectorAll('.fiber-connections-container .cross-fiber-table .fiber-item').forEach(function(tableItem) {
        tableItem.addEventListener('click', function(e) {
            if (e.target.closest('button, input, select')) return;
            if (!isEditMode) return;
            var splitterId = tableItem.getAttribute('data-splitter-id');
            var cableId = tableItem.getAttribute('data-cable-id');
            var fiberNumber = parseInt(tableItem.getAttribute('data-fiber-number'), 10);
            if (splitterId && tableItem.classList.contains('fiber-item--splitter-output-proxy') && cableId) {
                if (isNaN(fiberNumber)) return;
                if (schemeSplitterOutputPick && schemeSplitterOutputPick.hostObj === sleeveObj) {
                    tryConnectSchemeSplitterOutputToFiber(sleeveObj, cableId, fiberNumber);
                    return;
                }
                if (tableItem.getAttribute('data-fiber-selectable') === 'false') return;
                var portEls = document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]');
                for (var i = 0; i < portEls.length; i++) {
                    if (portEls[i].getAttribute('data-cable-id') === cableId && portEls[i].getAttribute('data-fiber-number') === String(fiberNumber)) {
                        portEls[i].click();
                        break;
                    }
                }
                return;
            }
            if (splitterId) {
                var kind = tableItem.getAttribute('data-splitter-fiber-kind');
                var outputIndex = parseInt(tableItem.getAttribute('data-output-index'), 10);
                if (schemeSplitterWirePick && schemeSplitterWirePick.hostObj === sleeveObj &&
                    schemeSplitterWirePick.cableId && schemeSplitterWirePick.fiberNumber != null && kind === 'input') {
                    tryConnectSchemeFiberToSplitter(sleeveObj, schemeSplitterWirePick.cableId, schemeSplitterWirePick.fiberNumber, splitterId);
                    return;
                }
                if (tableItem.getAttribute('data-fiber-selectable') !== 'true') return;
                if (kind === 'input') {
                    startSchemeSplitterWirePick(sleeveObj, { splitterId: splitterId });
                } else if (kind === 'output' && !isNaN(outputIndex)) {
                    startSchemeSplitterOutputPick(sleeveObj, splitterId, outputIndex);
                }
                return;
            }
            if (!cableId || isNaN(fiberNumber)) return;
            if (schemeSplitterOutputPick && schemeSplitterOutputPick.hostObj === sleeveObj) {
                tryConnectSchemeSplitterOutputToFiber(sleeveObj, cableId, fiberNumber);
                return;
            }
            if (tableItem.getAttribute('data-fiber-selectable') === 'false') return;
            var portElsCable = document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]');
            for (var j = 0; j < portElsCable.length; j++) {
                if (portElsCable[j].getAttribute('data-cable-id') === cableId && portElsCable[j].getAttribute('data-fiber-number') === String(fiberNumber)) {
                    portElsCable[j].click();
                    break;
                }
            }
        });
    });

    document.querySelectorAll('.fiber-ws-splitter-col-locate').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-splitter-id');
            if (sid) scrollSchemeToSplitter(sleeveObj, sid);
        });
    });
    document.querySelectorAll('.fiber-ws-splitter-col-edit').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-splitter-id');
            if (sid) openFiberSchemeSplitterEditPanel(sleeveObj, sid);
        });
    });

    document.querySelectorAll('#fiber-connections-svg path[id^="connection-"], #fiber-connections-svg path.fiber-scheme-link-hit, #fiber-connections-svg polygon[data-connection-index]').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'), 10);
            if (connIndex >= 0 && connIndex < fiberConnections.length) {
                selectFiberConnectionForLabel(sleeveObj, connIndex, { focusInput: true });
            }
        });
    });

    document.querySelectorAll('.fiber-conn-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'), 10);
            deleteFiberConnectionByIndex(sleeveObj, connIndex);
        });
    });

    document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
        row.addEventListener('click', function(e) {
            if (e.target.closest('input, button')) return;
            if (!isEditMode) return;
            const connIndex = parseInt(row.getAttribute('data-connection-index'), 10);
            if (!isNaN(connIndex)) selectFiberConnectionForLabel(sleeveObj, connIndex, { focusInput: false });
        });
    });

    var barInput = document.getElementById('fiber-conn-label-bar-input');
    if (barInput) {
        function saveBarLabel() {
            var mode = barInput.getAttribute('data-link-mode') || 'splice';
            if (mode === 'splitter') {
                if (selectedSplitterLink) updateSplitterLinkLabel(sleeveObj, selectedSplitterLink, barInput.value.trim());
                return;
            }
            const connIndex = parseInt(barInput.getAttribute('data-connection-index'), 10);
            if (isNaN(connIndex)) return;
            updateFiberConnectionLabel(sleeveObj, connIndex, barInput.value.trim());
        }
        barInput.addEventListener('input', function() {
            var mode = barInput.getAttribute('data-link-mode') || 'splice';
            if (mode === 'splitter') return;
            const connIndex = parseInt(barInput.getAttribute('data-connection-index'), 10);
            if (isNaN(connIndex)) return;
            document.querySelectorAll('.fiber-connection-label-input[data-connection-index="' + connIndex + '"]').forEach(function(inp) {
                if (document.activeElement !== inp) inp.value = barInput.value;
            });
        });
        barInput.addEventListener('change', saveBarLabel);
        barInput.addEventListener('blur', saveBarLabel);
    }
    var barGoto = document.getElementById('fiber-conn-label-bar-goto');
    if (barGoto) {
        barGoto.addEventListener('click', function() {
            var connIndex = selectedFiberConnectionIndex;
            closeFiberConnLabelModal(sleeveObj, true, true);
            var root = document.querySelector('.fiber-workspace');
            if (root) {
                var tab = root.querySelector('.fiber-ws-tab[data-tab="connections"]');
                if (tab) tab.click();
            }
            if (connIndex != null) {
                document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
                    row.classList.toggle('fiber-connection-row--selected', row.getAttribute('data-connection-index') === String(connIndex));
                    if (row.getAttribute('data-connection-index') === String(connIndex)) {
                        try { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(false); }
                    }
                });
            }
        });
    }
    var barDelete = document.getElementById('fiber-conn-label-bar-delete');
    if (barDelete) {
        barDelete.addEventListener('click', function() {
            if (selectedSplitterLink) {
                deleteSplitterLink(sleeveObj, selectedSplitterLink);
                return;
            }
            if (selectedFiberConnectionIndex == null) return;
            deleteFiberConnectionByIndex(sleeveObj, selectedFiberConnectionIndex);
        });
    }
    var barClose = document.getElementById('fiber-conn-label-bar-close');
    if (barClose) {
        barClose.addEventListener('click', function() {
            closeFiberConnLabelModal(sleeveObj, true);
        });
    }
    var barBackdrop = document.getElementById('fiber-conn-label-bar-backdrop');
    if (barBackdrop) {
        barBackdrop.addEventListener('click', function() {
            closeFiberConnLabelModal(sleeveObj, true);
        });
    }
    var barModal = document.getElementById('fiber-conn-label-bar');
    if (barModal) {
        barModal.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeFiberConnLabelModal(sleeveObj, true);
            }
        });
        var barPanel = barModal.querySelector('.fiber-conn-label-modal__panel');
        if (barPanel) {
            barPanel.addEventListener('click', function(e) { e.stopPropagation(); });
        }
    }

    var connSearch = document.getElementById('fiber-connections-search');
    if (connSearch) {
        connSearch.addEventListener('input', function() {
            const q = connSearch.value.trim().toLowerCase();
            document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
                const hay = row.getAttribute('data-search') || '';
                row.hidden = !!(q && hay.indexOf(q) < 0);
            });
        });
    }

    document.querySelectorAll('.fiber-label-input').forEach(input => {
        function saveLabel() {
            const cableId = input.getAttribute('data-cable-id');
            const fiberNumber = parseInt(input.getAttribute('data-fiber-number'), 10);
            if (!cableId || isNaN(fiberNumber)) return;
            const newLabel = input.value.trim();
            updateFiberLabel(sleeveObj, cableId, fiberNumber, newLabel);
        }
        input.addEventListener('click', function(e) { e.stopPropagation(); });
        input.addEventListener('change', function(e) { e.stopPropagation(); saveLabel(); });
        input.addEventListener('blur', function(e) { e.stopPropagation(); saveLabel(); });
    });

    document.querySelectorAll('.fiber-connection-label-input, .fiber-scheme-connection-label-input').forEach(function(input) {
        function saveConnLabel() {
            const connIndex = parseInt(input.getAttribute('data-connection-index'), 10);
            if (isNaN(connIndex)) return;
            updateFiberConnectionLabel(sleeveObj, connIndex, input.value.trim());
        }
        input.addEventListener('click', function(e) { e.stopPropagation(); });
        input.addEventListener('change', function(e) { e.stopPropagation(); saveConnLabel(); });
        input.addEventListener('blur', function(e) { e.stopPropagation(); saveConnLabel(); });
    });

    document.querySelectorAll('.btn-connect-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showNodeSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromNode(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-onu').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showOnuSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-mc').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showMediaConverterSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-splitter-onu').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-splitter-id');
            var oi = parseInt(btn.getAttribute('data-output-index'), 10);
            var facade = resolveSplitterObject(sid);
            if (facade) showSplitterOutputOnuDialog(facade, oi);
        });
    });
    document.querySelectorAll('.btn-connect-splitter-mc').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-splitter-id');
            var oi = parseInt(btn.getAttribute('data-output-index'), 10);
            showSplitterOutputMediaConverterDialog(sleeveObj, sid, oi);
        });
    });
    document.querySelectorAll('.btn-connect-splitter-node').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-splitter-id');
            var oi = parseInt(btn.getAttribute('data-output-index'), 10);
            showSplitterOutputNodeDialog(sleeveObj, sid, oi);
        });
    });

    document.querySelectorAll('.btn-connect-olt').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showOltSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-olt').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromOlt(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-onu').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromOnu(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-mc').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromMediaConverter(sleeveObj, cableId, fiberNumber);
        });
    });
    
    document.querySelectorAll('.btn-disconnect-splitter').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromSplitter(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-splitter-output').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const splitterId = this.getAttribute('data-splitter-id');
            const outputIndex = parseInt(this.getAttribute('data-output-index'), 10);
            const facade = resolveSplitterObject(splitterId);
            if (facade) deleteSplitterOutput(facade, outputIndex);
        });
    });

    document.querySelectorAll('.btn-restore-fiber').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'), 10);
            restoreFiberInSleeve(sleeveObj, cableId, fiberNumber);
        });
    });
    
    document.querySelectorAll('.fiber-port-select').forEach(select => {
        select.addEventListener('change', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'), 10);
            if (!cableId || isNaN(fiberNumber)) return;
            const portValue = this.value;
            updateFiberPort(sleeveObj, cableId, fiberNumber, portValue);
        });
    });

    setupFiberWorkspaceUI();
    bindModalObjectNameEditors();
    bindFiberSchemeCanvasHandlers(sleeveObj);
    setupFiberSchemeCableSideHandlers(sleeveObj);

    document.querySelectorAll('.fiber-conn-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'), 10);
            const conns = sleeveObj.properties.get('fiberConnections') || [];
            if (connIndex >= 0 && connIndex < conns.length) {
                conns.splice(connIndex, 1);
                sleeveObj.properties.set('fiberConnections', conns);
                saveData();
                showObjectInfo(sleeveObj);
            }
        });
    });

    setupFiberSchemeHoverHandlers();
    setupFiberSchemeZoomHandlers(sleeveObj);
    setupFiberSchemeSplitterHandlers(sleeveObj);
    updateSchemeSplitterPickUI();
}

function setupFiberSchemeCableSideHandlers(hostObj) {
    if (!hostObj || !isEditMode) return;
    function flipCableSide(cableId) {
        if (!cableId || typeof toggleFiberSchemeCableSide !== 'function') return;
        if (typeof captureFiberWorkspaceUiState === 'function') captureFiberWorkspaceUiState();
        if (!toggleFiberSchemeCableSide(hostObj, cableId)) return;
        if (typeof refreshObjectModal === 'function') refreshObjectModal(hostObj);
        else if (typeof showObjectInfo === 'function') showObjectInfo(hostObj);
    }
    document.querySelectorAll('.fiber-ws-cable-side-flip').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            flipCableSide(this.getAttribute('data-cable-id'));
        });
    });
    var svg = document.getElementById('fiber-connections-svg');
    if (!svg) return;
    svg.querySelectorAll('.fiber-cable-side-flip-hit').forEach(function(hit) {
        hit.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        hit.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            flipCableSide(hit.getAttribute('data-cable-id'));
        });
    });
}

function setupFiberSchemeSplitterHandlers(hostObj) {
    if (!hostObj || !window.EmbeddedSplitters || !isEditMode) return;
    var svg = document.getElementById('fiber-connections-svg');
    if (!svg) return;

    var addBtn = document.getElementById('fiber-scheme-add-splitter');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            openFiberSchemeSplitterAddPanel();
        });
    }
    var addConfirm = document.getElementById('fiber-scheme-splitter-add-confirm');
    var addCancel = document.getElementById('fiber-scheme-splitter-add-cancel');
    var addClose = document.getElementById('fiber-scheme-splitter-add-close');
    var addBackdrop = document.getElementById('fiber-scheme-splitter-add-backdrop');
    function confirmAddSplitter() {
        var ratioEl = document.getElementById('fiber-scheme-splitter-ratio');
        var splitRatio = ratioEl ? (parseInt(ratioEl.value, 10) || 8) : 8;
        var svgW = parseFloat(svg.getAttribute('width')) || 800;
        var svgH = parseFloat(svg.getAttribute('height')) || 400;
        var rec = EmbeddedSplitters.add(hostObj, { splitRatio: splitRatio, svgWidth: svgW, svgHeight: svgH });
        closeFiberSchemeSplitterAddPanel();
        showObjectInfo(hostObj);
        if (rec && rec.id) {
            setTimeout(function() { scrollSchemeToSplitter(hostObj, rec.id); }, 120);
        }
    }
    if (addConfirm) addConfirm.addEventListener('click', confirmAddSplitter);
    if (addCancel) addCancel.addEventListener('click', closeFiberSchemeSplitterAddPanel);
    if (addClose) addClose.addEventListener('click', closeFiberSchemeSplitterAddPanel);
    if (addBackdrop) addBackdrop.addEventListener('click', closeFiberSchemeSplitterAddPanel);

    var editConfirm = document.getElementById('fiber-scheme-splitter-edit-confirm');
    var editCancel = document.getElementById('fiber-scheme-splitter-edit-cancel');
    var editClose = document.getElementById('fiber-scheme-splitter-edit-close');
    var editBackdrop = document.getElementById('fiber-scheme-splitter-edit-backdrop');
    var editRatioEl = document.getElementById('fiber-scheme-splitter-edit-ratio');
    if (editRatioEl) {
        editRatioEl.addEventListener('change', function() {
            if (schemeSplitterEditId) refreshSplitterEditWarn(hostObj, schemeSplitterEditId);
        });
    }
    if (editConfirm) editConfirm.addEventListener('click', function() { confirmFiberSchemeSplitterEdit(hostObj); });
    if (editCancel) editCancel.addEventListener('click', closeFiberSchemeSplitterEditPanel);
    if (editClose) editClose.addEventListener('click', closeFiberSchemeSplitterEditPanel);
    if (editBackdrop) editBackdrop.addEventListener('click', closeFiberSchemeSplitterEditPanel);

    if (!window._schemeSplitterEscBound) {
        window._schemeSplitterEscBound = true;
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            var addPanel = document.getElementById('fiber-scheme-splitter-add-panel');
            var editPanel = document.getElementById('fiber-scheme-splitter-edit-panel');
            if (schemeSplitterWirePick || schemeSplitterOutputPick) { clearAllSchemeSplitterPicks(); e.preventDefault(); return; }
            if (editPanel && !editPanel.hidden) { closeFiberSchemeSplitterEditPanel(); e.preventDefault(); return; }
            if (addPanel && !addPanel.hidden) { closeFiberSchemeSplitterAddPanel(); e.preventDefault(); }
        });
    }

    var dragState = null;

    function svgPointFromEvent(evt) {
        var pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        var ctm = svg.getScreenCTM();
        if (!ctm) return { x: 0, y: 0 };
        var sp = pt.matrixTransform(ctm.inverse());
        return { x: sp.x, y: sp.y };
    }

    svg.querySelectorAll('.fiber-scheme-splitter-link-hit').forEach(function(hit) {
        hit.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            var meta = parseSplitterLinkMeta(hit);
            if (meta) selectSplitterLinkForLabel(hostObj, meta, { focusInput: true });
        });
    });

    svg.querySelectorAll('.fiber-scheme-splitter-rotate-hit').forEach(function(hit) {
        hit.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        hit.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            if (!isEditMode) return;
            var sid = hit.getAttribute('data-splitter-id');
            if (!sid || !window.EmbeddedSplitters) return;
            EmbeddedSplitters.toggleSchemeMirrored(hostObj, sid, svgW, svgH);
            showObjectInfo(hostObj);
        });
    });

    svg.querySelectorAll('.fiber-scheme-splitter-edit-hit').forEach(function(hit) {
        hit.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        hit.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var sid = hit.getAttribute('data-splitter-id');
            if (sid) openFiberSchemeSplitterEditPanel(hostObj, sid);
        });
    });

    svg.querySelectorAll('.fiber-scheme-splitter-delete-hit').forEach(function(hit) {
        hit.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        hit.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var g = hit.closest('.fiber-scheme-splitter');
            if (!g) return;
            var sid = g.getAttribute('data-splitter-id');
            if (!sid) return;
            var rec = EmbeddedSplitters.findInHost(hostObj, sid);
            var label = rec ? (rec.name || 'Сплиттер') : 'сплиттер';
            var doRemove = function() {
                EmbeddedSplitters.remove(hostObj, sid);
                showObjectInfo(hostObj);
            };
            if (typeof showConfirm === 'function') {
                showConfirm('Удалить «' + label + '» и все его GPON-связи?', 'Удаление сплиттера', { confirmText: 'Удалить' }).then(function(ok) {
                    if (ok) doRemove();
                });
            } else if (window.confirm('Удалить сплиттер?')) doRemove();
        });
    });

    var svgW = parseFloat(svg.getAttribute('width')) || 800;
    var svgH = parseFloat(svg.getAttribute('height')) || 400;

    function onSchemeSplitterWireTargetClick(splitterId) {
        if (!splitterId || !isEditMode) return;
        if (schemeSplitterOutputPick && schemeSplitterOutputPick.hostObj === hostObj) {
            tryConnectSchemeSplitterOutputToSplitter(hostObj, splitterId);
            return;
        }
        if (schemeSplitterWirePick && schemeSplitterWirePick.hostObj === hostObj &&
            schemeSplitterWirePick.cableId && schemeSplitterWirePick.fiberNumber != null) {
            tryConnectSchemeFiberToSplitter(hostObj, schemeSplitterWirePick.cableId, schemeSplitterWirePick.fiberNumber, splitterId);
            return;
        }
        if (schemeSplitterWirePick && schemeSplitterWirePick.hostObj === hostObj && schemeSplitterWirePick.splitterId === splitterId) {
            clearSchemeSplitterWirePick();
            return;
        }
        startSchemeSplitterWirePick(hostObj, { splitterId: splitterId });
    }

    function onMove(e) {
        if (!dragState) return;
        var p = svgPointFromEvent(e);
        if (!dragState.moved && (Math.abs(p.x - dragState.start.x) > 4 || Math.abs(p.y - dragState.start.y) > 4)) {
            dragState.moved = true;
        }
        if (!dragState.moved) return;
        var rec = EmbeddedSplitters.findInHost(hostObj, dragState.id);
        var ratio = rec ? rec.splitRatio : 8;
        var clamped = EmbeddedSplitters.clampPosition(p.x, p.y, svgW, svgH, ratio);
        EmbeddedSplitters.move(hostObj, dragState.id, clamped.x, clamped.y, svgW, svgH);
        var spBox = EmbeddedSplitters.computeSchemeSplitterBox
            ? EmbeddedSplitters.computeSchemeSplitterBox(parseInt(ratio, 10) || 8)
            : { w: EmbeddedSplitters.DEFAULT_W, h: EmbeddedSplitters.DEFAULT_H };
        dragState.el.setAttribute('transform', 'translate(' + (clamped.x - spBox.w / 2) + ',' + (clamped.y - spBox.h / 2) + ')');
        if (EmbeddedSplitters.updateSplitterLinkPaths) {
            EmbeddedSplitters.updateSplitterLinkPaths(svg, dragState.id, clamped.x, clamped.y, ratio, {
                buildConnectionPath: buildFiberSchemeConnectionPath,
                nodeR: 4,
                badgeW: 22,
                svgWidth: svgW,
                svgHeight: svgH,
                hostObj: hostObj
            });
        }
        updateFiberSchemeSplicePaths(svg, hostObj, svgW, svgH, 6);
    }

    function onUp() {
        if (!dragState) return;
        var wasDrag = dragState.moved;
        var sid = dragState.id;
        dragState.el.classList.remove('fiber-scheme-splitter--dragging');
        dragState = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!wasDrag && sid) {
            onSchemeSplitterWireTargetClick(sid);
        }
    }

    svg.querySelectorAll('.fiber-scheme-splitter-port').forEach(function(port) {
        port.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        port.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            var sid = port.getAttribute('data-splitter-id') || (port.closest('.fiber-scheme-splitter') && port.closest('.fiber-scheme-splitter').getAttribute('data-splitter-id'));
            var oi = parseInt(port.getAttribute('data-output-index'), 10);
            if (!sid || isNaN(oi)) return;
            if (schemeSplitterOutputPick && schemeSplitterOutputPick.hostObj === hostObj) {
                clearSchemeSplitterOutputPick();
                return;
            }
            startSchemeSplitterOutputPick(hostObj, sid, oi);
        });
    });

    svg.querySelectorAll('.fiber-scheme-splitter-input-port').forEach(function(port) {
        port.addEventListener('mousedown', function(e) {
            e.stopPropagation();
        });
        port.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            var sid = port.getAttribute('data-splitter-id');
            if (!sid) return;
            onSchemeSplitterWireTargetClick(sid);
        });
    });

    var fitBtn = document.getElementById('fiber-scheme-fit-splitters');
    if (fitBtn) {
        fitBtn.addEventListener('click', function() { fitSchemeViewToSplitters(hostObj); });
    }
    var resetBtn = document.getElementById('fiber-scheme-reset-splitters');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            var doReset = function() {
                EmbeddedSplitters.resetAllPositions(hostObj, svgW, svgH);
                showObjectInfo(hostObj);
                if (typeof showSuccess === 'function') showSuccess('Сплиттеры возвращены в центр схемы.', 'Схема');
            };
            if (typeof showConfirm === 'function') {
                showConfirm('Вернуть все сплиттеры в центральную зону схемы?', 'Сброс позиций', { confirmText: 'Сбросить' }).then(function(ok) {
                    if (ok) doReset();
                });
            } else if (window.confirm('Сбросить позиции сплиттеров?')) doReset();
        });
    }
    document.querySelectorAll('.fiber-ws-splitter-locate').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var sid = btn.getAttribute('data-splitter-id');
            if (sid) scrollSchemeToSplitter(hostObj, sid);
        });
    });

    svg.querySelectorAll('.fiber-scheme-splitter-body').forEach(function(body) {
        body.style.cursor = 'grab';
        body.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var g = body.closest('.fiber-scheme-splitter');
            if (!g) return;
            var sid = g.getAttribute('data-splitter-id');
            if (!sid) return;
            e.preventDefault();
            dragState = { id: sid, el: g, start: svgPointFromEvent(e), moved: false };
            g.classList.add('fiber-scheme-splitter--dragging');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        body.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var g = body.closest('.fiber-scheme-splitter');
            if (!g) return;
            var sid = g.getAttribute('data-splitter-id');
            if (sid) openFiberSchemeSplitterEditPanel(hostObj, sid);
        });
    });

    svg.querySelectorAll('.fiber-scheme-splitter-header').forEach(function(header) {
        header.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            var g = header.closest('.fiber-scheme-splitter');
            var sid = g && g.getAttribute('data-splitter-id');
            if (sid) onSchemeSplitterWireTargetClick(sid);
        });
    });

    document.querySelectorAll('.fiber-ws-splitter-edit').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-splitter-id');
            if (sid) openFiberSchemeSplitterEditPanel(hostObj, sid);
        });
    });
}

function setupFiberSchemeZoomHandlers(hostObj) {
    var viewport = document.getElementById('fiber-scheme-viewport');
    var inner = document.getElementById('fiber-scheme-zoom-inner');
    var slider = document.getElementById('fiber-scheme-zoom-slider');
    var label = document.getElementById('fiber-scheme-zoom-label');
    var btnIn = document.getElementById('fiber-scheme-zoom-in');
    var btnOut = document.getElementById('fiber-scheme-zoom-out');
    var btnFit = document.getElementById('fiber-scheme-zoom-fit');
    var btnReset = document.getElementById('fiber-scheme-zoom-reset');
    if (!viewport || !inner) return;

    var sessionScroll = pendingFiberSchemeSessionScroll;
    pendingFiberSchemeSessionScroll = null;
    var savedState = hostObj ? getFiberSchemeViewState(hostObj) : null;
    var zoom = savedState && savedState.zoom != null
        ? savedState.zoom
        : parseFloat(sessionStorage.getItem('fiberSchemeZoom') || '1');
    if (isNaN(zoom)) zoom = 1;
    zoom = Math.max(0.3, Math.min(2, zoom));
    var hasSavedView = !!(savedState && (savedState.zoom != null || savedState.schemeTop != null || savedState.schemeLeft != null));

    function applyZoom(z, opts) {
        opts = opts || {};
        zoom = Math.max(0.3, Math.min(2, Math.round(z * 20) / 20));
        inner.style.transform = 'scale(' + zoom + ')';
        inner.style.transformOrigin = 'top center';
        if (slider) slider.value = String(Math.round(zoom * 100));
        if (label) label.textContent = Math.round(zoom * 100) + '%';
        try { sessionStorage.setItem('fiberSchemeZoom', String(zoom)); } catch (e) {}
        if (!opts.skipPersist) schedulePersistFiberSchemeViewState(hostObj, zoom);
    }

    function fitToViewport() {
        var curSvg = document.getElementById('fiber-connections-svg');
        if (!curSvg) return;
        applyZoom(computeFiberSchemeFitZoom(viewport, curSvg));
    }

    applyZoom(zoom, { skipPersist: true });
    restoreFiberSchemeViewportState(hostObj, sessionScroll);

    if (btnIn) btnIn.addEventListener('click', function() { applyZoom(zoom + 0.1); });
    if (btnOut) btnOut.addEventListener('click', function() { applyZoom(zoom - 0.1); });
    if (btnFit) btnFit.addEventListener('click', fitToViewport);
    if (btnReset) btnReset.addEventListener('click', function() { applyZoom(1); });
    if (slider) slider.addEventListener('input', function() { applyZoom(parseInt(this.value, 10) / 100); });
    viewport.addEventListener('wheel', function(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            applyZoom(zoom + (e.deltaY < 0 ? 0.08 : -0.08));
        }
    }, { passive: false });

    var onViewportScroll = function() {
        schedulePersistFiberSchemeViewState(hostObj, zoom);
    };
    viewport.addEventListener('scroll', onViewportScroll, { passive: true });
    var tableWrap = document.querySelector('.cross-fiber-table-wrap');
    if (tableWrap) tableWrap.addEventListener('scroll', onViewportScroll, { passive: true });

    if (!hasSavedView) {
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                var curSvg = document.getElementById('fiber-connections-svg');
                if (!curSvg || viewport.clientWidth < 80) return;
                var svgW = parseFloat(curSvg.getAttribute('width')) || 0;
                var svgH = parseFloat(curSvg.getAttribute('height')) || 0;
                if (svgW * zoom > viewport.clientWidth - 6 || svgH * zoom > viewport.clientHeight - 6) {
                    fitToViewport();
                }
            });
        });
    }
}

function setupFiberSchemeHoverHandlers() {
    const svg = document.getElementById('fiber-connections-svg');
    if (!svg) return;

    let activeFiberKey = null;
    let activeConnIndex = null;
    let activeSplitterLinkKey = null;

    function setConnLabelVisible(connIndex, visible) {
        svg.querySelectorAll('.fiber-scheme-conn-label').forEach(function(el) {
            const idx = el.getAttribute('data-connection-index');
            el.classList.toggle('is-visible', visible && connIndex != null && idx === String(connIndex));
        });
    }

    function setFiberLabelVisible(fiberKey, visible) {
        svg.querySelectorAll('.fiber-scheme-fiber-label').forEach(function(el) {
            const fk = el.getAttribute('data-fiber-key');
            el.classList.toggle('is-visible', visible && fiberKey != null && fk === fiberKey);
        });
    }

    function setSplitterLinkLabelVisible(linkKey, visible) {
        svg.querySelectorAll('.fiber-scheme-splitter-conn-label').forEach(function(el) {
            el.classList.toggle('is-visible', visible && linkKey != null && el.getAttribute('data-link-key') === linkKey);
        });
    }

    function findConnIndexForFiberKey(fiberKey) {
        if (!fiberKey) return null;
        var linkEl = svg.querySelector('.fiber-scheme-link[data-from-fiber="' + fiberKey + '"], .fiber-scheme-link[data-to-fiber="' + fiberKey + '"]');
        if (!linkEl) return null;
        var ci = parseInt(linkEl.getAttribute('data-connection-index'), 10);
        return isNaN(ci) ? null : ci;
    }

    function findSplitterLinkKeyForFiberKey(fiberKey) {
        if (!fiberKey) return null;
        var parsed = typeof parseFiberConnectionKey === 'function' ? parseFiberConnectionKey(fiberKey) : null;
        if (!parsed) return null;
        var links = svg.querySelectorAll('.fiber-scheme-splitter-link[data-cable-id][data-fiber-number]');
        for (var i = 0; i < links.length; i++) {
            var el = links[i];
            if (el.getAttribute('data-cable-id') === parsed.cableId &&
                String(el.getAttribute('data-fiber-number')) === String(parsed.fiberNumber)) {
                return el.getAttribute('data-link-key');
            }
        }
        return null;
    }

    function showSplitterLinkHover(linkKey) {
        if (!linkKey) return;
        svg.querySelectorAll('.fiber-scheme-splitter-link, .fiber-scheme-splitter-link-hit').forEach(function(el) {
            var hit = el.getAttribute('data-link-key') === linkKey;
            el.classList.toggle('fiber-scheme-splitter-link-hovered', hit);
            el.classList.toggle('fiber-scheme-splitter-link-dimmed', !hit);
        });
        setSplitterLinkLabelVisible(linkKey, true);
    }

    function clearHover() {
        if (!activeFiberKey && activeConnIndex == null && !activeSplitterLinkKey) return;
        activeFiberKey = null;
        activeConnIndex = null;
        activeSplitterLinkKey = null;
        svg.classList.remove('fiber-scheme-hover-active');
        svg.querySelectorAll('.fiber-scheme-hovered, .fiber-scheme-dimmed, .fiber-scheme-link-hovered, .fiber-scheme-link-dimmed, .fiber-scheme-splitter-link-hovered, .fiber-scheme-splitter-link-dimmed, .fiber-cable-block-hovered').forEach(function(el) {
            el.classList.remove('fiber-scheme-hovered', 'fiber-scheme-dimmed', 'fiber-scheme-link-hovered', 'fiber-scheme-link-dimmed', 'fiber-scheme-splitter-link-hovered', 'fiber-scheme-splitter-link-dimmed', 'fiber-cable-block-hovered');
        });
        svg.querySelectorAll('.fiber-scheme-link-group').forEach(function(el) {
            el.classList.remove('fiber-scheme-link-hovered', 'fiber-scheme-link-dimmed');
        });
        setConnLabelVisible(null, false);
        setFiberLabelVisible(null, false);
        setSplitterLinkLabelVisible(null, false);
    }

    function applySplitterLinkHover(linkKey) {
        if (!linkKey) return;
        activeSplitterLinkKey = linkKey;
        activeConnIndex = null;
        activeFiberKey = null;
        svg.classList.add('fiber-scheme-hover-active');
        setFiberLabelVisible(null, false);
        var linkEl = svg.querySelector('.fiber-scheme-splitter-link[data-link-key="' + linkKey + '"], .fiber-scheme-splitter-link-hit[data-link-key="' + linkKey + '"]');
        var cableId = linkEl ? linkEl.getAttribute('data-cable-id') : null;
        var fiberNumber = linkEl ? linkEl.getAttribute('data-fiber-number') : null;
        var fiberKey = cableId && fiberNumber != null ? fiberConnKey(cableId, parseInt(fiberNumber, 10)) : null;
        var spliceConnIndex = findConnIndexForFiberKey(fiberKey);
        if (spliceConnIndex != null) {
            setConnLabelVisible(spliceConnIndex, true);
            svg.querySelectorAll('.fiber-scheme-link-group').forEach(function(el) {
                var hit = el.getAttribute('data-connection-index') === String(spliceConnIndex);
                el.classList.toggle('fiber-scheme-link-hovered', hit);
                el.classList.toggle('fiber-scheme-link-dimmed', !hit);
            });
        } else {
            setConnLabelVisible(null, false);
        }
        showSplitterLinkHover(linkKey);
        svg.querySelectorAll('.fiber-scheme-port').forEach(function(el) {
            var hit = fiberKey && el.getAttribute('data-fiber-key') === fiberKey;
            el.classList.toggle('fiber-scheme-hovered', hit);
            el.classList.toggle('fiber-scheme-dimmed', !hit);
        });
        if (cableId) {
            svg.querySelectorAll('.fiber-cable-block').forEach(function(el) {
                el.classList.toggle('fiber-cable-block-hovered', el.getAttribute('data-cable-id') === cableId);
            });
        }
    }

    function applyConnHover(connIndex, fiberKeyForHighlight) {
        if (connIndex == null) return;
        activeConnIndex = connIndex;
        if (fiberKeyForHighlight) activeFiberKey = fiberKeyForHighlight;
        svg.classList.add('fiber-scheme-hover-active');
        setConnLabelVisible(connIndex, true);
        setFiberLabelVisible(null, false);
        setSplitterLinkLabelVisible(null, false);

        var linkEl = svg.querySelector('.fiber-scheme-link[data-connection-index="' + connIndex + '"]');
        var fromKey = linkEl ? linkEl.getAttribute('data-from-fiber') : null;
        var toKey = linkEl ? linkEl.getAttribute('data-to-fiber') : null;
        var splitterLinkKey = findSplitterLinkKeyForFiberKey(fromKey) || findSplitterLinkKeyForFiberKey(toKey);
        if (splitterLinkKey) showSplitterLinkHover(splitterLinkKey);

        svg.querySelectorAll('.fiber-scheme-port').forEach(function(el) {
            var fk = el.getAttribute('data-fiber-key');
            var hit = fk === fromKey || fk === toKey;
            el.classList.toggle('fiber-scheme-hovered', hit);
            el.classList.toggle('fiber-scheme-dimmed', !hit);
        });
        svg.querySelectorAll('.fiber-scheme-link-group').forEach(function(el) {
            var hit = el.getAttribute('data-connection-index') === String(connIndex);
            el.classList.toggle('fiber-scheme-link-hovered', hit);
            el.classList.toggle('fiber-scheme-link-dimmed', !hit);
        });
        if (fromKey || toKey) {
            var port = svg.querySelector('.fiber-scheme-port[data-fiber-key="' + (fromKey || toKey) + '"]');
            var cableId = port ? port.getAttribute('data-cable-id') : null;
            svg.querySelectorAll('.fiber-cable-block').forEach(function(el) {
                el.classList.toggle('fiber-cable-block-hovered', cableId && el.getAttribute('data-cable-id') === cableId);
            });
        }
    }

    function applyHover(fiberKey) {
        if (!fiberKey) return;
        var linkEl = svg.querySelector('.fiber-scheme-link[data-from-fiber="' + fiberKey + '"], .fiber-scheme-link[data-to-fiber="' + fiberKey + '"]');
        var connIndex = linkEl ? parseInt(linkEl.getAttribute('data-connection-index'), 10) : null;
        if (connIndex != null && !isNaN(connIndex)) {
            applyConnHover(connIndex, fiberKey);
            return;
        }
        activeFiberKey = fiberKey;
        activeConnIndex = null;
        setConnLabelVisible(null, false);
        const portEl = svg.querySelector('.fiber-scheme-port[data-fiber-key="' + fiberKey + '"]');
        const hasDirectLabel = portEl && portEl.getAttribute('data-direct-label');
        setFiberLabelVisible(fiberKey, !!hasDirectLabel);
        svg.classList.add('fiber-scheme-hover-active');
        const port = svg.querySelector('.fiber-scheme-port[data-fiber-key="' + fiberKey + '"]');
        const cableId = port ? port.getAttribute('data-cable-id') : null;

        svg.querySelectorAll('.fiber-scheme-port').forEach(function(el) {
            el.classList.toggle('fiber-scheme-hovered', el.getAttribute('data-fiber-key') === fiberKey);
            el.classList.toggle('fiber-scheme-dimmed', el.getAttribute('data-fiber-key') !== fiberKey);
        });
        svg.querySelectorAll('.fiber-scheme-link-group').forEach(function(el) {
            var linkEl = el.querySelector('.fiber-scheme-link');
            var hit = linkEl && (linkEl.getAttribute('data-from-fiber') === fiberKey || linkEl.getAttribute('data-to-fiber') === fiberKey);
            el.classList.toggle('fiber-scheme-link-hovered', !!hit);
            el.classList.toggle('fiber-scheme-link-dimmed', !hit);
            if (hit) {
                var ci = parseInt(el.getAttribute('data-connection-index'), 10);
                if (!isNaN(ci)) setConnLabelVisible(ci, true);
            }
        });
        svg.querySelectorAll('.fiber-cable-block').forEach(function(el) {
            el.classList.toggle('fiber-cable-block-hovered', cableId && el.getAttribute('data-cable-id') === cableId);
        });
    }

    svg.addEventListener('mouseover', function(e) {
        const connLabelEl = e.target.closest('.fiber-scheme-conn-label, .fiber-scheme-connection-label-input');
        if (connLabelEl) {
            var ciLbl = parseInt(connLabelEl.getAttribute('data-connection-index') ||
                (connLabelEl.closest('.fiber-scheme-conn-label') && connLabelEl.closest('.fiber-scheme-conn-label').getAttribute('data-connection-index')), 10);
            if (!isNaN(ciLbl)) applyConnHover(ciLbl, null);
            return;
        }
        const linkHit = e.target.closest('.fiber-scheme-link-hit, .fiber-scheme-link');
        if (linkHit && linkHit.getAttribute('data-connection-index') != null) {
            var ci = parseInt(linkHit.getAttribute('data-connection-index'), 10);
            if (!isNaN(ci)) applyConnHover(ci, null);
            return;
        }
        const splitterLinkHit = e.target.closest('.fiber-scheme-splitter-link-hit, .fiber-scheme-splitter-link, .fiber-scheme-splitter-conn-label');
        if (splitterLinkHit) {
            var lk = splitterLinkHit.getAttribute('data-link-key') ||
                (splitterLinkHit.closest('.fiber-scheme-splitter-conn-label') && splitterLinkHit.closest('.fiber-scheme-splitter-conn-label').getAttribute('data-link-key'));
            if (lk) applySplitterLinkHover(lk);
            return;
        }
        const port = e.target.closest('.fiber-scheme-port');
        if (port) applyHover(port.getAttribute('data-fiber-key'));
    });
    svg.addEventListener('mouseleave', function(e) {
        const rt = e.relatedTarget;
        if (!rt || !svg.contains(rt)) clearHover();
    });
}
