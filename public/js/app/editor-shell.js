/**
 * Editor shell: flat edit tools + tool properties panel + info-dock.
 */
(function () {
    'use strict';

    var INFO_DOCK_COLLAPSED_KEY = 'infoDockCollapsed';
    var activeEditTool = null;

    function fitMapSoon() {
        if (typeof myMap !== 'undefined' && myMap && myMap.container) {
            setTimeout(function () {
                try { myMap.container.fitToViewport(); } catch (e) {}
            }, 280);
        }
    }

    function stopMapCreationModes() {
        if (typeof objectPlacementMode !== 'undefined' && objectPlacementMode && typeof cancelObjectPlacement === 'function') {
            cancelObjectPlacement();
        }
        if (typeof currentCableTool !== 'undefined' && currentCableTool) {
            var cableBtn = document.getElementById('addCable');
            if (cableBtn) cableBtn.click();
        }
        if (typeof regionDrawMode !== 'undefined' && regionDrawMode && typeof cancelRegionDraw === 'function') {
            cancelRegionDraw();
        }
    }

    function activateMapTool(which) {
        if (typeof isEditMode !== 'undefined' && !isEditMode) {
            if (typeof showInfo === 'function') showInfo('Включите режим «Редактирование»', 'Режим');
            return;
        }

        if (which === 'object') {
            if (typeof regionDrawMode !== 'undefined' && regionDrawMode && typeof cancelRegionDraw === 'function') {
                cancelRegionDraw();
            }
            var sel = document.getElementById('objectType');
            var type = sel ? sel.value : '';
            if (type === 'node' || type === 'cross') {
                var nameEl = document.getElementById('objectName');
                var name = nameEl && nameEl.value ? nameEl.value.trim() : '';
                if (!name) {
                    if (typeof currentCableTool !== 'undefined' && currentCableTool) {
                        var cableBtn = document.getElementById('addCable');
                        if (cableBtn) cableBtn.click();
                    }
                    if (typeof objectPlacementMode !== 'undefined' && objectPlacementMode && typeof cancelObjectPlacement === 'function') {
                        cancelObjectPlacement();
                    }
                    return;
                }
            }
            if (typeof handleAddObject === 'function') handleAddObject();
            return;
        }

        if (which === 'cable') {
            if (typeof regionDrawMode !== 'undefined' && regionDrawMode && typeof cancelRegionDraw === 'function') {
                cancelRegionDraw();
            }
            if (typeof currentCableTool === 'undefined' || !currentCableTool) {
                var addCableBtn = document.getElementById('addCable');
                if (addCableBtn) addCableBtn.click();
            } else if (typeof objectPlacementMode !== 'undefined' && objectPlacementMode && typeof cancelObjectPlacement === 'function') {
                cancelObjectPlacement();
            }
            return;
        }

        if (which === 'region') {
            if (typeof regionDrawMode === 'undefined' || !regionDrawMode) {
                if (typeof startRegionDraw === 'function') startRegionDraw();
            } else if (typeof objectPlacementMode !== 'undefined' && objectPlacementMode && typeof cancelObjectPlacement === 'function') {
                cancelObjectPlacement();
            }
        }
    }

    function setToolPropsOpen(open) {
        var panel = document.getElementById('sidebar');
        if (!panel) return;
        if (open) {
            panel.classList.add('is-filled');
            panel.classList.remove('properties-panel--empty');
            document.body.classList.add('properties-open');
            document.body.classList.remove('sidebar-collapsed');
        } else {
            panel.classList.remove('is-filled');
            panel.classList.add('properties-panel--empty');
            document.body.classList.remove('properties-open');
            activeEditTool = null;
            document.querySelectorAll('.edit-tool-chip').forEach(function (chip) {
                chip.classList.remove('object-type-chip--active', 'is-active');
                chip.setAttribute('aria-pressed', 'false');
            });
        }
        fitMapSoon();
        if (open && typeof window.initPanelPlexusCanvases === 'function') {
            requestAnimationFrame(function () { window.initPanelPlexusCanvases(panel); });
        }
    }

    function showToolPropsSection(which) {
        var objectSec = document.getElementById('toolPropsObject');
        var cableSec = document.getElementById('toolPropsCable');
        var regionSec = document.getElementById('toolPropsRegion');
        var empty = document.getElementById('propertiesEmpty');
        var title = document.getElementById('propertiesPanelTitle');
        var sub = document.getElementById('propertiesPanelSub');
        if (objectSec) objectSec.hidden = which !== 'object';
        if (cableSec) cableSec.hidden = which !== 'cable';
        if (regionSec) regionSec.hidden = which !== 'region';
        if (empty) empty.hidden = !!which;
        if (title) {
            title.textContent = which === 'cable' ? 'Кабель' : (which === 'region' ? 'Регион' : 'Объект');
        }
        if (sub) {
            if (which === 'object') {
                var sel = document.getElementById('objectType');
                var label = (typeof getObjectTypeLabel === 'function' && sel)
                    ? getObjectTypeLabel(sel.value)
                    : ((sel && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || '');
                sub.hidden = !label;
                sub.textContent = label ? ('Клик по карте — поставить: ' + label) : '';
            } else if (which === 'cable') {
                sub.hidden = false;
                sub.textContent = 'Кликайте по карте или объектам, чтобы проложить кабель';
            } else if (which === 'region') {
                sub.hidden = false;
                sub.textContent = 'Кликайте по карте, чтобы нарисовать контур региона';
            } else {
                sub.hidden = true;
                sub.textContent = '';
            }
        }
    }

    function openToolProps(which, opts) {
        opts = opts || {};
        activeEditTool = which;
        showToolPropsSection(which);
        setToolPropsOpen(true);

        document.querySelectorAll('.edit-tool-chip').forEach(function (chip) {
            var tool = chip.getAttribute('data-edit-tool');
            var type = chip.getAttribute('data-type');
            var active = false;
            if (which === 'object' && tool === 'object') {
                var sel = document.getElementById('objectType');
                active = !!(sel && type && sel.value === type);
            } else if (which === 'cable' && tool === 'cable') {
                active = true;
            } else if (which === 'region' && tool === 'region') {
                active = true;
            }
            chip.classList.toggle('object-type-chip--active', active);
            chip.classList.toggle('is-active', active);
            chip.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        if (which === 'object' && typeof syncObjectTypePickerUI === 'function') {
            syncObjectTypePickerUI();
            if (typeof getObjectTypeLabel === 'function') {
                var sel2 = document.getElementById('objectType');
                var sub = document.getElementById('propertiesPanelSub');
                if (sub && sel2) {
                    sub.hidden = false;
                    sub.textContent = 'Клик по карте — поставить: ' + getObjectTypeLabel(sel2.value);
                }
            }
        }

        if (opts.activateMap !== false) {
            activateMapTool(which);
        }
    }

    function closeToolProps() {
        stopMapCreationModes();
        setToolPropsOpen(false);
        showToolPropsSection(null);
    }

    function setupEditToolsStrip() {
        var strip = document.getElementById('editToolsStrip');
        if (!strip || strip._editToolsBound) return;
        strip._editToolsBound = true;

        strip.addEventListener('click', function (e) {
            var chip = e.target.closest('.edit-tool-chip, .object-type-chip');
            if (!chip || !strip.contains(chip)) return;
            var tool = chip.getAttribute('data-edit-tool') || 'object';
            if (tool === 'object') {
                var type = chip.getAttribute('data-type');
                var select = document.getElementById('objectType');
                if (select && type) {
                    if (select.value !== type) {
                        select.value = type;
                        select.dispatchEvent(new Event('change'));
                    } else if (typeof syncObjectTypePickerUI === 'function') {
                        syncObjectTypePickerUI();
                    }
                }
                openToolProps('object');
            } else if (tool === 'cable') {
                openToolProps('cable');
            } else if (tool === 'region') {
                openToolProps('region');
            }
        });

        var closeBtn = document.getElementById('propertiesPanelClose');
        if (closeBtn && !closeBtn._toolPropsCloseBound) {
            closeBtn._toolPropsCloseBound = true;
            closeBtn.addEventListener('click', function () {
                closeToolProps();
            });
        }

        var nameInput = document.getElementById('objectName');
        if (nameInput && !nameInput._toolPropsActivateBound) {
            nameInput._toolPropsActivateBound = true;
            function tryActivateNamedObject() {
                if (activeEditTool !== 'object') return;
                var sel = document.getElementById('objectType');
                var type = sel ? sel.value : '';
                if (type !== 'node' && type !== 'cross') return;
                if (!nameInput.value || !nameInput.value.trim()) return;
                if (typeof objectPlacementMode !== 'undefined' && objectPlacementMode) return;
                activateMapTool('object');
            }
            nameInput.addEventListener('change', tryActivateNamedObject);
            nameInput.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') tryActivateNamedObject();
            });
        }
    }

    function syncEditToolbarVisibility() {
        var toolbar = document.getElementById('editToolbar');
        if (!toolbar) return;
        var active = document.body.classList.contains('edit-mode-active');
        if (active) toolbar.removeAttribute('hidden');
        else {
            toolbar.setAttribute('hidden', '');
            closeToolProps();
        }
    }

    function setupInfoDock() {
        var dock = document.getElementById('infoDock');
        if (!dock || dock._infoDockBound) return;
        dock._infoDockBound = true;

        var toggleBtn = document.getElementById('infoDockToggle');
        if (toggleBtn && !toggleBtn._infoDockToggleBound) {
            toggleBtn._infoDockToggleBound = true;
            try {
                if (localStorage.getItem(INFO_DOCK_COLLAPSED_KEY) === '1') {
                    document.body.classList.add('info-dock-collapsed');
                    toggleBtn.setAttribute('aria-expanded', 'false');
                }
            } catch (err) {}

            toggleBtn.addEventListener('click', function () {
                var collapsed = document.body.classList.toggle('info-dock-collapsed');
                toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                toggleBtn.setAttribute('aria-label', collapsed ? 'Показать информационную панель' : 'Скрыть информационную панель');
                toggleBtn.setAttribute('title', collapsed ? 'Показать панель' : 'Скрыть панель');
                try { localStorage.setItem(INFO_DOCK_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch (err) {}
                fitMapSoon();
            });
        }

        if (typeof window.initPanelPlexusCanvases === 'function') {
            requestAnimationFrame(function () { window.initPanelPlexusCanvases(dock); });
        }
    }

    function initEditorShell() {
        setupEditToolsStrip();
        setupInfoDock();
        syncEditToolbarVisibility();
        // start with tool props hidden
        closeToolProps();
    }

    window.openToolProps = openToolProps;
    window.closeToolProps = closeToolProps;
    window.syncEditToolbarVisibility = syncEditToolbarVisibility;
    window.initEditorShell = initEditorShell;
    window.setupAppToolbarFlyouts = function () {};
    window.closeAllToolbarFlyouts = function () {};
    window.setupInfoDock = setupInfoDock;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEditorShell);
    } else {
        initEditorShell();
    }
})();
