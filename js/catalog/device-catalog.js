var DEVICE_CATALOG_DEFAULT = {
    'Huawei': ['MA5608', 'MA5683T', 'HG8145', 'HG8245'],
    'ZTE': ['C300', 'C320', 'F660', 'F670'],
    'FiberHome': ['AN5516'],
    'SNR': ['SNR-ONU-GPON-1G-mini'],
    'B-OptiX': ['BO-ONU-GPON-4G-1P-DW'],
    'MikroTik': ['hEX', 'hAP', 'RB750', 'CCR'],
    'Ruijie': ['S6750-H36C', 'S6730-H48X6C'],
    'Eltex': ['NTU-2', 'NTU-4', 'Router', 'Switch'],
    'Nokia': ['Router', 'Switch', 'SFU', 'HGU'],
    'Iskratel': ['Router', 'Switch', 'SFU', 'HGU'],
    'BDCOM': ['Router', 'Switch', 'SFU', 'HGU'],
    'Sercomm': ['SFU', 'HGU', 'WAP'],
    'D-Link': ['Router', 'Switch', 'WAP'],
    'Zyxel': ['Router', 'Switch', 'SFU', 'HGU', 'WAP'],
    'Ubiquiti': ['WAP', 'Router', 'Switch'],
    'Keenetic': ['Router', 'WAP'],
    'TP-Link': ['Router', 'Switch', 'WAP'],
    'Cisco': ['Router', 'Switch'],
    'Cambium': ['WAP']
};

var deviceCatalog = {};

function getDeviceCatalog() {
    var out = {};
    Object.keys(deviceCatalog || {}).forEach(function(m) {
        if (!m) return;
        var arr = (deviceCatalog[m] || []).slice();
        out[m] = arr;
    });
    return out;
}

function setDeviceCatalog(catalog) {
    deviceCatalog = {};
    if (catalog && typeof catalog === 'object') {
        Object.keys(catalog).forEach(function(m) {
            if (m && Array.isArray(catalog[m])) deviceCatalog[m] = catalog[m].filter(Boolean);
        });
    }
    saveDeviceCatalog();
}

function resetDeviceCatalogToDefault() {
    deviceCatalog = JSON.parse(JSON.stringify(DEVICE_CATALOG_DEFAULT));
    saveDeviceCatalog();
}

function addDeviceManufacturer(name) {
    name = (name || '').trim();
    if (!name || deviceCatalog[name]) return false;
    deviceCatalog[name] = [];
    saveDeviceCatalog();
    return true;
}

function removeDeviceManufacturer(name) {
    if (!deviceCatalog[name]) return false;
    delete deviceCatalog[name];
    saveDeviceCatalog();
    return true;
}

function addDeviceModel(manufacturer, model) {
    manufacturer = (manufacturer || '').trim();
    model = (model || '').trim();
    if (!manufacturer || !model) return false;
    if (!deviceCatalog[manufacturer]) deviceCatalog[manufacturer] = [];
    if (deviceCatalog[manufacturer].indexOf(model) !== -1) return false;
    deviceCatalog[manufacturer].push(model);
    deviceCatalog[manufacturer].sort();
    saveDeviceCatalog();
    return true;
}

function removeDeviceModel(manufacturer, model) {
    if (!deviceCatalog[manufacturer]) return false;
    var idx = deviceCatalog[manufacturer].indexOf(model);
    if (idx === -1) return false;
    deviceCatalog[manufacturer].splice(idx, 1);
    saveDeviceCatalog();
    return true;
}

function getDeviceManufacturers() {
    return Object.keys(deviceCatalog || {}).filter(Boolean).sort();
}

function getDeviceModels(manufacturer) {
    var mfr = (manufacturer || '').trim();
    if (!mfr) {
        var all = [];
        Object.keys(deviceCatalog || {}).forEach(function(m) {
            (deviceCatalog[m] || []).forEach(function(mod) { if (mod && all.indexOf(mod) === -1) all.push(mod); });
        });
        return all.sort();
    }
    return (deviceCatalog[mfr] || []).slice();
}

function addCustomManufacturer(v) {
    v = (v || '').trim();
    if (!v) return;
    addDeviceManufacturer(v);
}

function addCustomModel(v, manufacturer) {
    v = (v || '').trim();
    if (!v) return;
    var mfr = (manufacturer || '').trim();
    if (mfr) {
        addDeviceModel(mfr, v);
    } else {
        addDeviceManufacturer('Другое');
        addDeviceModel('Другое', v);
    }
}

var CUSTOM_DEVICE_OPTIONS_STORAGE_KEY = 'networkmap_customDeviceOptions';
function saveDeviceCatalog() {
    var payload = { deviceCatalog: getDeviceCatalog() };
    try { localStorage.setItem(CUSTOM_DEVICE_OPTIONS_STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    if (getApiBase()) {
        try {
            fetch(getApiBase() + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ customDeviceOptions: payload })
            }).catch(function() {});
        } catch (e) {}
    }
}

function loadDeviceCatalog(opts) {
    if (opts && opts.deviceCatalog && typeof opts.deviceCatalog === 'object' && Object.keys(opts.deviceCatalog).length > 0) {
        setDeviceCatalog(opts.deviceCatalog);
        return;
    }
    var hasLegacyData = opts && (
        (opts.manufacturers && opts.manufacturers.length > 0) ||
        (opts.modelsByManufacturer && typeof opts.modelsByManufacturer === 'object' && Object.keys(opts.modelsByManufacturer).length > 0)
    );
    if (hasLegacyData) {
        var merged = JSON.parse(JSON.stringify(DEVICE_CATALOG_DEFAULT));
        (opts.manufacturers || []).forEach(function(m) { if (m && !merged[m]) merged[m] = []; });
        if (opts.modelsByManufacturer && typeof opts.modelsByManufacturer === 'object') {
            Object.keys(opts.modelsByManufacturer).forEach(function(m) {
                if (!merged[m]) merged[m] = [];
                (opts.modelsByManufacturer[m] || []).forEach(function(mod) {
                    if (mod && merged[m].indexOf(mod) === -1) merged[m].push(mod);
                });
            });
        }
        setDeviceCatalog(merged);
        return;
    }
    if (Object.keys(deviceCatalog || {}).length === 0) {
        resetDeviceCatalogToDefault();
    }
}

function loadCustomDeviceOptions(opts) {
    loadDeviceCatalog(opts || {});
}

function loadCustomDeviceOptionsFromStorage() {
    try {
        var raw = localStorage.getItem(CUSTOM_DEVICE_OPTIONS_STORAGE_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') loadDeviceCatalog(parsed);
    } catch (e) {}
}

function populateDeviceDatalists() {
    var dlM = document.getElementById('deviceManufacturersList');
    if (dlM) {
        dlM.innerHTML = '';
        (getDeviceManufacturers() || []).forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m;
            dlM.appendChild(opt);
        });
    }
}

function populateModelDatalistForManufacturer(manufacturer, datalistId) {
    datalistId = datalistId || 'deviceModelsList';
    var dlMod = document.getElementById(datalistId);
    if (dlMod) {
        dlMod.innerHTML = '';
        (getDeviceModels(manufacturer) || []).forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m;
            dlMod.appendChild(opt);
        });
    }
}

function initDeviceComboboxes(container) {
    container = container || document;

    function resetComboboxPanelPosition(pnl) {
        if (!pnl || !pnl.style) return;
        if (pnl.style.position === 'fixed') {
            pnl.style.position = '';
            pnl.style.top = '';
            pnl.style.left = '';
            pnl.style.width = '';
            pnl.style.minWidth = '';
        }
    }

    var comboboxes = container.querySelectorAll('.device-combobox');
    comboboxes.forEach(function(wrapper) {
        if (wrapper.dataset.initialized) return;
        wrapper.dataset.initialized = '1';
        var type = wrapper.dataset.type;
        var valueId = wrapper.dataset.valueId;
        var manufacturerId = wrapper.dataset.manufacturerId;
        var valueInput = document.getElementById(valueId) || wrapper.querySelector('input[type="hidden"]');
        var trigger = wrapper.querySelector('.device-combobox-trigger');
        var panel = wrapper.querySelector('.device-combobox-panel');
        var searchInput = wrapper.querySelector('.device-combobox-search');
        var listEl = wrapper.querySelector('.device-combobox-list');
        if (!trigger || !panel || !listEl || !valueInput) return;

        var placeholderMod = 'Выберите модель';
        var placeholderMfr = 'Выберите производителя';
        var placeholder = type === 'model' ? placeholderMod : placeholderMfr;

        function getOptions() {
            if (type === 'manufacturer') return getDeviceManufacturers() || [];
            var mfrInput = manufacturerId ? document.getElementById(manufacturerId) : null;
            var mfr = mfrInput ? (mfrInput.value || '').trim() : '';
            return getDeviceModels(mfr) || [];
        }

        function renderList(filter) {
            var opts = getOptions();
            filter = (filter || '').toLowerCase().trim();
            if (filter) opts = opts.filter(function(o) { return String(o).toLowerCase().indexOf(filter) !== -1; });
            listEl.innerHTML = '';
            if (opts.length === 0) {
                var li = document.createElement('li');
                li.className = 'empty';
                li.textContent = type === 'model' && manufacturerId && !(document.getElementById(manufacturerId) || {}).value ? 'Сначала выберите производителя' : 'Нет вариантов';
                listEl.appendChild(li);
            } else {
                opts.forEach(function(opt) {
                    var li = document.createElement('li');
                    li.textContent = opt;
                    li.setAttribute('data-value', opt);
                    li.addEventListener('click', function() {
                        if (li.classList.contains('empty')) return;
                        valueInput.value = opt;
                        trigger.textContent = opt;
                        trigger.setAttribute('aria-expanded', 'false');
                        panel.classList.remove('is-open');
                        resetComboboxPanelPosition(panel);
                        if (searchInput) searchInput.value = '';
                        renderList('');
                        var ev = new Event('change', { bubbles: true });
                        valueInput.dispatchEvent(ev);
                        var evInput = new Event('input', { bubbles: true });
                        valueInput.dispatchEvent(evInput);
                        if (type === 'manufacturer' && manufacturerId) {
                            var modelCombobox = container.querySelector('.device-combobox[data-manufacturer-id="' + manufacturerId + '"]');
                            if (modelCombobox) {
                                var mValInp = document.getElementById(modelCombobox.dataset.valueId) || modelCombobox.querySelector('input[type="hidden"]');
                                var mTrigger = modelCombobox.querySelector('.device-combobox-trigger');
                                if (mValInp) mValInp.value = '';
                                if (mTrigger) mTrigger.textContent = placeholderMod;
                                var mList = modelCombobox.querySelector('.device-combobox-list');
                                if (mList) mList.innerHTML = '';
                            }
                        }
                    });
                    listEl.appendChild(li);
                });
            }
        }

        function getSelectableItems() {
            return listEl.querySelectorAll('li[data-value]:not(.empty)');
        }
        function getHighlightedLi() {
            return listEl.querySelector('.device-combobox-item-highlight');
        }
        function setHighlight(idx) {
            var items = getSelectableItems();
            listEl.querySelectorAll('.device-combobox-item-highlight').forEach(function(el) { el.classList.remove('device-combobox-item-highlight'); });
            if (items.length && idx >= 0 && idx < items.length) {
                items[idx].classList.add('device-combobox-item-highlight');
                items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        function selectHighlighted() {
            var hl = getHighlightedLi();
            if (hl && hl.getAttribute('data-value')) hl.click();
        }
        function closePanel() {
            panel.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
            resetComboboxPanelPosition(panel);
            if (searchInput) searchInput.value = '';
        }

        function onPanelKeydown(e) {
            if (!panel.classList.contains('is-open')) return;
            if (e.key === 'Escape') {
                closePanel();
                trigger.focus();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'ArrowDown') {
                var items = getSelectableItems();
                var hl = getHighlightedLi();
                var idx = hl && items.length ? Array.prototype.indexOf.call(items, hl) + 1 : 0;
                if (idx >= items.length) idx = 0;
                setHighlight(idx);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'ArrowUp') {
                var items = getSelectableItems();
                var hl = getHighlightedLi();
                var idx = hl && items.length ? Array.prototype.indexOf.call(items, hl) - 1 : items.length - 1;
                if (idx < 0) idx = items.length - 1;
                setHighlight(idx);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                selectHighlighted();
                e.stopPropagation();
            }
        }

        trigger.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                if (!panel.classList.contains('is-open')) {
                    e.preventDefault();
                    trigger.click();
                    if (e.key === 'ArrowDown') setHighlight(0);
                    else if (e.key === 'ArrowUp') setHighlight(getSelectableItems().length - 1);
                }
            }
        });

        panel.addEventListener('keydown', onPanelKeydown);
        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (e.key === 'ArrowDown') setHighlight(0);
                    else setHighlight(getSelectableItems().length - 1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    selectHighlighted();
                }
            });
            searchInput.addEventListener('input', function() { renderList(this.value); });
            searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
        }
        listEl.addEventListener('click', function(e) { e.stopPropagation(); });

        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            var isOpen = panel.classList.contains('is-open');
            document.querySelectorAll('.device-combobox-panel.is-open').forEach(function(p) {
                if (p !== panel) { p.classList.remove('is-open'); var t = p.closest('.device-combobox').querySelector('.device-combobox-trigger'); if (t) t.setAttribute('aria-expanded', 'false'); resetComboboxPanelPosition(p); }
            });
            if (isOpen) {
                panel.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
                resetComboboxPanelPosition(panel);
            } else {
                panel.classList.add('is-open');
                trigger.setAttribute('aria-expanded', 'true');
                if (wrapper.closest('.sidebar')) {
                    var rect = trigger.getBoundingClientRect();
                    panel.style.position = 'fixed';
                    panel.style.top = (rect.bottom + 4) + 'px';
                    panel.style.left = rect.left + 'px';
                    panel.style.width = rect.width + 'px';
                    panel.style.minWidth = rect.width + 'px';
                    panel.style.right = 'auto';
                }
                renderList('');
                if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            }
        });

    });

    if (!window._deviceComboboxCloseBound) {
        window._deviceComboboxCloseBound = true;
        document.addEventListener('click', function closeComboboxOnOutside(e) {
            if (!e.target.closest('.device-combobox')) {
                document.querySelectorAll('.device-combobox-panel.is-open').forEach(function(p) {
                    p.classList.remove('is-open');
                    var t = p.closest('.device-combobox').querySelector('.device-combobox-trigger');
                    if (t) t.setAttribute('aria-expanded', 'false');
                    if (initDeviceComboboxes.resetPanelPosition) initDeviceComboboxes.resetPanelPosition(p);
                });
            }
        }, true);
    }
}
initDeviceComboboxes.resetPanelPosition = function(pnl) {
    if (!pnl || !pnl.style) return;
    if (pnl.style.position === 'fixed') {
        pnl.style.position = '';
        pnl.style.top = '';
        pnl.style.left = '';
        pnl.style.width = '';
        pnl.style.minWidth = '';
    }
};

function setDeviceComboboxValue(valueId, value) {
    var wrapper = document.querySelector('.device-combobox[data-value-id="' + valueId + '"]');
    if (!wrapper) return;
    var valueInput = document.getElementById(valueId) || wrapper.querySelector('input[type="hidden"]');
    var trigger = wrapper.querySelector('.device-combobox-trigger');
    if (valueInput) valueInput.value = value || '';
    if (trigger) trigger.textContent = value || (wrapper.dataset.type === 'model' ? 'Выберите модель' : 'Выберите производителя');
}

function renderDeviceCatalogList() {
    var container = document.getElementById('deviceCatalogList');
    if (!container) return;
    var catalog = getDeviceCatalog();
    var mfrs = Object.keys(catalog).sort();
    if (mfrs.length === 0) {
        container.innerHTML = '<p class="text-muted-inline" style="font-size: 0.8125rem; margin: 0;">Справочник пуст. Добавьте производителя или сбросьте к значениям по умолчанию.</p>';
        return;
    }
    var html = '';
    mfrs.forEach(function(mfr) {
        var models = (catalog[mfr] || []).slice();
        html += '<div class="device-catalog-mfr" data-mfr="' + escapeHtml(mfr) + '" style="margin-bottom: 12px; padding: 10px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">';
        html += '<strong style="font-size: 0.875rem;">' + escapeHtml(mfr) + '</strong>';
        html += '<div style="display: flex; gap: 6px;">';
        html += '<input type="text" class="form-input device-catalog-new-model" data-mfr="' + escapeHtml(mfr) + '" placeholder="Модель" style="width: 120px; padding: 4px 8px; font-size: 0.8125rem;">';
        html += '<button type="button" class="device-catalog-add-model" data-mfr="' + escapeHtml(mfr) + '" title="Добавить модель" style="padding: 4px 10px; font-size: 0.75rem; background: var(--accent-primary); color: white; border: none; border-radius: 4px; cursor: pointer;">+</button>';
        html += '<button type="button" class="device-catalog-remove-mfr" data-mfr="' + escapeHtml(mfr) + '" title="Удалить производителя" style="padding: 4px 8px; font-size: 0.75rem; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">✕</button>';
        html += '</div></div>';
        html += '<div class="device-catalog-models" style="display: flex; flex-wrap: wrap; gap: 4px;">';
        models.forEach(function(mod) {
            html += '<span class="device-catalog-model-tag" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; font-size: 0.75rem; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border-color);">';
            html += escapeHtml(mod);
            html += '<button type="button" class="device-catalog-remove-model" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" title="Удалить" style="padding: 0; margin: 0; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.9em; line-height: 1;">×</button>';
            html += '</span>';
        });
        html += '</div></div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.device-catalog-add-model').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mfr = btn.getAttribute('data-mfr');
            var inp = container.querySelector('.device-catalog-new-model[data-mfr="' + mfr + '"]');
            var val = inp ? inp.value.trim() : '';
            if (!val) { if (typeof showError === 'function') showError('Введите модель', ''); return; }
            if (addDeviceModel(mfr, val)) {
                inp.value = '';
                renderDeviceCatalogList();
                populateDeviceDatalists();
                populateModelDatalistForManufacturer(mfr);
                if (typeof showInfo === 'function') showInfo('Модель добавлена', '');
            }
        });
    });
    container.querySelectorAll('.device-catalog-new-model').forEach(function(inp) {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var mfr = inp.getAttribute('data-mfr');
                var val = inp.value.trim();
                if (val && addDeviceModel(mfr, val)) {
                    inp.value = '';
                    renderDeviceCatalogList();
                    populateDeviceDatalists();
                    populateModelDatalistForManufacturer(mfr);
                    if (typeof showInfo === 'function') showInfo('Модель добавлена', '');
                }
            }
        });
    });
    container.querySelectorAll('.device-catalog-remove-mfr').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mfr = btn.getAttribute('data-mfr');
            (async function() {
                if (!(await showConfirm('Удалить производителя «' + mfr + '» и все его модели?', 'Удалить производителя', { confirmText: 'Удалить' }))) return;
            if (removeDeviceManufacturer(mfr)) {
                renderDeviceCatalogList();
                populateDeviceDatalists();
                if (typeof showInfo === 'function') showInfo('Производитель удалён', '');
            }
            })();
        });
    });
    container.querySelectorAll('.device-catalog-remove-model').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mfr = btn.getAttribute('data-mfr');
            var mod = btn.getAttribute('data-model');
            if (removeDeviceModel(mfr, mod)) {
                renderDeviceCatalogList();
                populateDeviceDatalists();
                populateModelDatalistForManufacturer(mfr);
                if (typeof showInfo === 'function') showInfo('Модель удалена', '');
            }
        });
    });
}

function setupDeviceCatalogHandlers() {
    var addMfrBtn = document.getElementById('deviceCatalogAddMfr');
    var resetBtn = document.getElementById('deviceCatalogReset');
    if (addMfrBtn) {
        addMfrBtn.addEventListener('click', function() {
            var inp = document.getElementById('deviceCatalogNewMfr');
            var name = inp ? inp.value.trim() : '';
            if (!name) { if (typeof showError === 'function') showError('Введите название производителя', ''); return; }
            if (addDeviceManufacturer(name)) {
                if (inp) inp.value = '';
                renderDeviceCatalogList();
                populateDeviceDatalists();
                if (typeof showInfo === 'function') showInfo('Производитель добавлен', '');
            } else {
                if (typeof showError === 'function') showError('Производитель уже существует', '');
            }
        });
    }
    var newMfrInput = document.getElementById('deviceCatalogNewMfr');
    if (newMfrInput) {
        newMfrInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (addMfrBtn) addMfrBtn.click();
            }
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            (async function() {
                if (!(await showConfirm('Сбросить справочник к значениям по умолчанию? Текущие данные будут заменены.', 'Сброс справочника', { confirmText: 'Сбросить' }))) return;
            resetDeviceCatalogToDefault();
            renderDeviceCatalogList();
            populateDeviceDatalists();
            if (typeof showInfo === 'function') showInfo('Справочник сброшен', '');
            })();
        });
    }
}

function setupAccordions() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const accordionSection = this.parentElement;
            const isActive = accordionSection.classList.contains('active');

            document.querySelectorAll('.accordion-section').forEach(section => {
                section.classList.remove('active');
            });

            if (!isActive) {
                accordionSection.classList.add('active');
            }
        });
    });

    const firstAccordion = document.querySelector('.accordion-section');
    if (firstAccordion) {
        firstAccordion.classList.add('active');
    }

    setupDeviceCatalogHandlers();
}

function openDeviceCatalogModal() {
    if (typeof requireAdmin === 'function' && !requireAdmin()) return;
    var modal = document.getElementById('deviceCatalogModal');
    if (modal) {
        modal.style.display = 'block';
        renderDeviceCatalogList();
    }
}

function closeDeviceCatalogModal() {
    var modal = document.getElementById('deviceCatalogModal');
    if (modal) modal.style.display = 'none';
}

function setupDeviceCatalogModalHandlers() {
    var closeBtn = document.querySelector('.close-device-catalog');
    if (closeBtn) closeBtn.addEventListener('click', closeDeviceCatalogModal);
    var modal = document.getElementById('deviceCatalogModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeDeviceCatalogModal();
        });
    }
}
