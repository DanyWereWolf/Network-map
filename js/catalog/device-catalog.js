/** Справочник для узла сети (шасси/маршрутизаторы и т.п., не OLT/ONU). */
var NODE_CATALOG_DEFAULT = {
    'MikroTik': ['hEX', 'hAP', 'RB750', 'CCR'],
    'Ruijie': ['S6750-H36C', 'S6730-H48X6C'],
    'Eltex': ['NTU-1', 'NTU-2', 'NTU-4', 'LTE-2X', 'LTP-2X'],
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
    'Cambium': ['WAP'],
    'Huawei': ['NE серия', 'ATN'],
    'ZTE': ['ZXR10']
};

/** Справочник только для OLT. */
var OLT_CATALOG_DEFAULT = {
    'Huawei': ['MA5608T', 'MA5683T', 'MA5800-X7'],
    'ZTE': ['C300', 'C320', 'C600'],
    'FiberHome': ['AN5516-01', 'AN5516-06'],
    'Eltex': ['LTP-8X', 'LTP-4X'],
    'BDCOM': ['P3310C', 'P3608B'],
    'SNR': ['SNR-GPON-OLT'],
    'B-OptiX': ['BO-GPON-OLT'],
    'Nokia': ['7360 ISAM FX']
};

/** Справочник только для ONU. */
var ONU_CATALOG_DEFAULT = {
    'Huawei': ['HG8145X6', 'HG8245Q2', 'HG8310M'],
    'ZTE': ['F601', 'F660', 'F670', 'F680'],
    'FiberHome': ['AN5506-01', 'AN5506-04'],
    'Eltex': ['LTP-ONT'],
    'SNR': ['SNR-ONU-GPON-1G-mini', 'SNR-ONU-GPON-1G-WiFi'],
    'B-OptiX': ['BO-ONU-GPON-4G-1P-DW'],
    'TP-Link': ['XC220-G3v'],
    'C-Data': ['FD511G-X'],
    'Sercomm': ['SFU', 'HGU', 'WAP'],
    'Nokia': ['SFU', 'HGU'],
    'Iskratel': ['SFU', 'HGU'],
    'BDCOM': ['SFU', 'HGU'],
    'D-Link': ['Router', 'Switch', 'WAP'],
    'Zyxel': ['Router', 'Switch', 'SFU', 'HGU', 'WAP'],
    'Ubiquiti': ['WAP', 'Router'],
    'Keenetic': ['Router', 'WAP'],
    'TP-Link': ['Router', 'Switch', 'WAP'],
    'Cisco': ['Router', 'Switch'],
    'Cambium': ['WAP']
};

/** Полный старый справочник (только для миграции со старых сохранений). */
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

/** Справочник только для камер (отдельно от OLT/ONU/узла). */
var CAMERA_CATALOG_DEFAULT = {
    'Hikvision': ['DS-2CD2143G2-I', 'DS-2CD2T47G2-L', 'DS-2DE2A404IW-DE3'],
    'Dahua': ['IPC-HFW2431S-S', 'IPC-HFW2231T-ZS', 'IPC-HDBW3441R-ZAS'],
    'Uniview': ['IPC2124LB-SF40', 'IPC322LR3-VSP28'],
    'Axis': ['P1445-LE', 'M4218-V'],
    'Tiandy': ['TC-C32XS'],
    'Trassir': ['TR-D2141IR3']
};

/** Справочник только для коммутаторов в узле (отдельно от узла/OLT/ONU). */
var SWITCH_CATALOG_DEFAULT = {
    'MikroTik': ['CRS326-24G-2S+', 'CSS326-24G-2S+', 'CRS312-4C+8XG', 'CRS354-48G-4S+2Q+'],
    'TP-Link': ['TL-SG1024DE', 'TL-SG3428', 'TL-SG3428X'],
    'Ruijie': ['RG-S2928G-E', 'RG-S5750C-28GT4XS-H'],
    'Eltex': ['MES3324F', 'MES2348B', 'MES2124'],
    'Cisco': ['CBS350-24T-4X', 'C9300-24T'],
    'D-Link': ['DGS-1210-28', 'DGS-1510-28X'],
    'Huawei': ['S5735-L24T4S-A1', 'S6730-H48X6C']
};

var nodeDeviceCatalog = {};
var oltDeviceCatalog = {};
var onuDeviceCatalog = {};
var cameraDeviceCatalog = {};
var switchDeviceCatalog = {};
/** switchModelDefaultPorts[manufacturer][model] = число портов по умолчанию при добавлении коммутатора. */
var switchModelDefaultPorts = {};

window.deviceCatalogActiveTab = 'switch';

var DEVICE_CATALOG_TAB_META = {
    switch: {
        label: 'Коммутаторы',
        desc: 'Коммутаторы в узле на карте: производитель и модель при редактировании узла и при добавлении коммутатора. Для модели можно задать число портов по умолчанию.'
    },
    olt: {
        label: 'OLT',
        desc: 'Оптические линейные терминалы на карте: производитель и модель при создании и редактировании OLT.'
    },
    onu: {
        label: 'ONU',
        desc: 'Абонентские терминалы в сплиттерах и узлах. Отдельный список от OLT и коммутаторов.'
    },
    camera: {
        label: 'Камеры',
        desc: 'Видеокамеры на карте: марка и модель при добавлении и в карточке объекта.'
    },
    node: {
        label: 'Медиаконвертер',
        desc: 'Оптические медиаконвертеры на карте (отдельно от коммутаторов узла сети).'
    }
};

var DEVICE_CATALOG_TAB_TONE = {
    switch: '#8b5cf6',
    olt: '#0ea5e9',
    onu: '#06b6d4',
    camera: '#64748b',
    node: '#14b8a6'
};

function syncDeviceCatalogTabButtons() {
    var tab = window.deviceCatalogActiveTab || 'switch';
    document.querySelectorAll('.device-catalog-tab').forEach(function(btn) {
        var t = btn.getAttribute('data-tab');
        var on = t === tab;
        btn.classList.toggle('device-catalog-tab-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var main = document.getElementById('deviceCatalogMain');
    if (main && DEVICE_CATALOG_TAB_TONE[tab]) {
        main.style.setProperty('--catalog-tone', DEVICE_CATALOG_TAB_TONE[tab]);
    }
}

var DEVICE_CATALOG_ALLOWED_TABS = { node: 1, olt: 1, onu: 1, camera: 1, switch: 1 };

function getDeviceCatalogStats(kind) {
    var catalog = getCatalogObjectRef(kind);
    var mfrs = Object.keys(catalog || {});
    var models = 0;
    mfrs.forEach(function(m) {
        models += (catalog[m] || []).length;
    });
    return { manufacturers: mfrs.length, models: models };
}

function getDeviceCatalogSearchQuery() {
    var inp = document.getElementById('deviceCatalogSearch');
    return inp ? inp.value.trim().toLowerCase() : '';
}

function catalogEntryMatchesSearch(mfr, models, q) {
    if (!q) return true;
    if (mfr.toLowerCase().indexOf(q) !== -1) return true;
    return (models || []).some(function(mod) {
        return String(mod).toLowerCase().indexOf(q) !== -1;
    });
}

function updateDeviceCatalogChrome() {
    var tab = window.deviceCatalogActiveTab || 'switch';
    if (!DEVICE_CATALOG_ALLOWED_TABS[tab]) tab = 'switch';
    var meta = DEVICE_CATALOG_TAB_META[tab] || DEVICE_CATALOG_TAB_META.switch;
    var stats = getDeviceCatalogStats(tab);

    var descEl = document.getElementById('deviceCatalogTabDesc');
    if (descEl) descEl.textContent = meta.desc;

    var sectionTitleEl = document.getElementById('deviceCatalogSectionTitle');
    if (sectionTitleEl) sectionTitleEl.textContent = meta.label;

    var tabStatsEl = document.getElementById('deviceCatalogTabStats');
    if (tabStatsEl) {
        tabStatsEl.textContent = stats.manufacturers + ' / ' + stats.models;
        tabStatsEl.title = stats.manufacturers + ' производителей, ' + stats.models + ' моделей в разделе';
    }

    var globalEl = document.getElementById('deviceCatalogGlobalStats');
    if (globalEl) {
        var totalM = 0;
        var totalMod = 0;
        Object.keys(DEVICE_CATALOG_TAB_META).forEach(function(k) {
            var s = getDeviceCatalogStats(k);
            totalM += s.manufacturers;
            totalMod += s.models;
        });
        globalEl.innerHTML =
            '<span class="device-catalog-hero-stat"><strong>' + totalM + '</strong> произв.</span>' +
            '<span class="device-catalog-hero-stat"><strong>' + totalMod + '</strong> мод.</span>';
    }

    syncDeviceCatalogTabButtons();

    document.querySelectorAll('.device-catalog-tab-badge[data-stat-tab]').forEach(function(badge) {
        var k = badge.getAttribute('data-stat-tab');
        if (!k || !DEVICE_CATALOG_ALLOWED_TABS[k]) return;
        var s = getDeviceCatalogStats(k);
        badge.textContent = s.manufacturers + ' / ' + s.models;
        badge.title = s.manufacturers + ' производителей, ' + s.models + ' моделей';
    });
}

function applyDeviceCatalogSearchFilter() {
    var q = getDeviceCatalogSearchQuery();
    var list = document.getElementById('deviceCatalogList');
    if (!list) return;
    var cards = list.querySelectorAll('.device-catalog-mfr');
    var visible = 0;
    cards.forEach(function(card) {
        var mfr = card.getAttribute('data-mfr') || '';
        var models = [];
        card.querySelectorAll('.device-catalog-model-name').forEach(function(el) {
            models.push(el.textContent);
        });
        var show = catalogEntryMatchesSearch(mfr, models, q);
        card.classList.toggle('is-hidden-by-search', !show);
        if (show) visible++;
    });
    var noRes = list.querySelector('.device-catalog-no-results');
    if (cards.length > 0 && q && visible === 0) {
        if (!noRes) {
            noRes = document.createElement('p');
            noRes.className = 'device-catalog-no-results';
            noRes.textContent = 'Ничего не найдено. Измените запрос или выберите другой раздел.';
            list.appendChild(noRes);
        }
    } else if (noRes) {
        noRes.remove();
    }
}

/** Слияние старого справочника «узла» в коммутаторы (узел сети = коммутатор). */
function mergeNodeCatalogIntoSwitch() {
    var changed = false;
    Object.keys(nodeDeviceCatalog || {}).forEach(function(mfr) {
        if (!mfr) return;
        if (!switchDeviceCatalog[mfr]) {
            switchDeviceCatalog[mfr] = [];
            changed = true;
        }
        var existing = {};
        (switchDeviceCatalog[mfr] || []).forEach(function(mod) { if (mod) existing[mod] = true; });
        (nodeDeviceCatalog[mfr] || []).forEach(function(mod) {
            if (mod && !existing[mod]) {
                switchDeviceCatalog[mfr].push(mod);
                existing[mod] = true;
                changed = true;
            }
        });
    });
    return changed;
}

function cloneDeepCatalog(cat) {
    var o = {};
    Object.keys(cat || {}).forEach(function(m) {
        if (!m) return;
        o[m] = (cat[m] || []).slice();
    });
    return o;
}

function getCatalogObjectRef(kind) {
    if (kind === 'node') return nodeDeviceCatalog;
    if (kind === 'olt') return oltDeviceCatalog;
    if (kind === 'onu') return onuDeviceCatalog;
    if (kind === 'camera') return cameraDeviceCatalog;
    if (kind === 'switch') return switchDeviceCatalog;
    if (kind === 'general') return nodeDeviceCatalog;
    return nodeDeviceCatalog;
}

function getCatalogDefault(kind) {
    if (kind === 'node' || kind === 'general') return NODE_CATALOG_DEFAULT;
    if (kind === 'olt') return OLT_CATALOG_DEFAULT;
    if (kind === 'onu') return ONU_CATALOG_DEFAULT;
    if (kind === 'camera') return CAMERA_CATALOG_DEFAULT;
    if (kind === 'switch') return SWITCH_CATALOG_DEFAULT;
    return NODE_CATALOG_DEFAULT;
}

function getDeviceCatalog() {
    var out = {};
    Object.keys(nodeDeviceCatalog || {}).forEach(function(m) {
        if (!m) return;
        out[m] = (nodeDeviceCatalog[m] || []).slice();
    });
    return out;
}

function getNodeDeviceCatalog() {
    return cloneDeepCatalog(nodeDeviceCatalog);
}

function getOltDeviceCatalog() {
    return cloneDeepCatalog(oltDeviceCatalog);
}

function getOnuDeviceCatalog() {
    return cloneDeepCatalog(onuDeviceCatalog);
}

function getCameraDeviceCatalog() {
    return cloneDeepCatalog(cameraDeviceCatalog);
}

function getSwitchDeviceCatalog() {
    return cloneDeepCatalog(switchDeviceCatalog);
}

function setDeviceCatalog(catalog) {
    nodeDeviceCatalog = {};
    if (catalog && typeof catalog === 'object') {
        Object.keys(catalog).forEach(function(m) {
            if (m && Array.isArray(catalog[m])) nodeDeviceCatalog[m] = catalog[m].filter(Boolean);
        });
    }
    saveDeviceCatalog();
}

function resetDeviceCatalogToDefault() {
    nodeDeviceCatalog = cloneDeepCatalog(NODE_CATALOG_DEFAULT);
    oltDeviceCatalog = cloneDeepCatalog(OLT_CATALOG_DEFAULT);
    onuDeviceCatalog = cloneDeepCatalog(ONU_CATALOG_DEFAULT);
    cameraDeviceCatalog = cloneDeepCatalog(CAMERA_CATALOG_DEFAULT);
    switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
    switchModelDefaultPorts = {};
    saveDeviceCatalog();
}

function resetDeviceCatalogTabToDefault(kind) {
    if (!DEVICE_CATALOG_ALLOWED_TABS[kind]) return;
    var def = getCatalogDefault(kind);
    if (kind === 'node') nodeDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'olt') oltDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'onu') onuDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'camera') cameraDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'switch') {
        switchDeviceCatalog = cloneDeepCatalog(def);
        switchModelDefaultPorts = {};
    }
    saveDeviceCatalog();
}

function addManufacturerForCatalog(kind, name) {
    name = (name || '').trim();
    if (!name) return false;
    var cat = getCatalogObjectRef(kind);
    if (cat[name]) return false;
    cat[name] = [];
    saveDeviceCatalog();
    return true;
}

function removeManufacturerForCatalog(kind, name) {
    var cat = getCatalogObjectRef(kind);
    if (!cat[name]) return false;
    delete cat[name];
    if (kind === 'switch' && switchModelDefaultPorts[name]) {
        delete switchModelDefaultPorts[name];
    }
    saveDeviceCatalog();
    return true;
}

function addModelForCatalog(kind, manufacturer, model) {
    manufacturer = (manufacturer || '').trim();
    model = (model || '').trim();
    if (!manufacturer || !model) return false;
    var cat = getCatalogObjectRef(kind);
    if (!cat[manufacturer]) cat[manufacturer] = [];
    if (cat[manufacturer].indexOf(model) !== -1) return false;
    cat[manufacturer].push(model);
    cat[manufacturer].sort();
    saveDeviceCatalog();
    return true;
}

function removeModelForCatalog(kind, manufacturer, model) {
    var cat = getCatalogObjectRef(kind);
    if (!cat[manufacturer]) return false;
    var idx = cat[manufacturer].indexOf(model);
    if (idx === -1) return false;
    cat[manufacturer].splice(idx, 1);
    if (kind === 'switch' && switchModelDefaultPorts[manufacturer]) {
        if (switchModelDefaultPorts[manufacturer][model] !== undefined) {
            delete switchModelDefaultPorts[manufacturer][model];
        }
        if (Object.keys(switchModelDefaultPorts[manufacturer]).length === 0) {
            delete switchModelDefaultPorts[manufacturer];
        }
    }
    saveDeviceCatalog();
    return true;
}

function getManufacturersForCatalog(kind) {
    return Object.keys(getCatalogObjectRef(kind) || {}).filter(Boolean).sort();
}

function getModelsForCatalog(kind, manufacturer) {
    var cat = getCatalogObjectRef(kind);
    var mfr = (manufacturer || '').trim();
    if (!mfr) {
        var all = [];
        Object.keys(cat || {}).forEach(function(m) {
            (cat[m] || []).forEach(function(mod) { if (mod && all.indexOf(mod) === -1) all.push(mod); });
        });
        return all.sort();
    }
    return (cat[mfr] || []).slice();
}

function addDeviceManufacturer(name) {
    return addManufacturerForCatalog('node', name);
}

function removeDeviceManufacturer(name) {
    return removeManufacturerForCatalog('node', name);
}

function addDeviceModel(manufacturer, model) {
    return addModelForCatalog('node', manufacturer, model);
}

function removeDeviceModel(manufacturer, model) {
    return removeModelForCatalog('node', manufacturer, model);
}

function getDeviceManufacturers() {
    return getManufacturersForCatalog('node');
}

function getDeviceModels(manufacturer) {
    return getModelsForCatalog('node', manufacturer);
}

function getSwitchModelDefaultPortCount(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return null;
    var byM = switchModelDefaultPorts[mfr];
    if (!byM || typeof byM !== 'object') return null;
    var n = parseInt(byM[mod], 10);
    if (isNaN(n) || n < 1) return null;
    return Math.min(96, n);
}

function setSwitchModelDefaultPortCount(manufacturer, model, portCount) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (portCount === null || portCount === undefined || portCount === '') {
        if (switchModelDefaultPorts[mfr] && switchModelDefaultPorts[mfr][mod] !== undefined) {
            delete switchModelDefaultPorts[mfr][mod];
            if (Object.keys(switchModelDefaultPorts[mfr]).length === 0) delete switchModelDefaultPorts[mfr];
        }
        saveDeviceCatalog();
        return true;
    }
    var n = parseInt(portCount, 10);
    if (isNaN(n) || n < 1) {
        if (switchModelDefaultPorts[mfr] && switchModelDefaultPorts[mfr][mod] !== undefined) {
            delete switchModelDefaultPorts[mfr][mod];
            if (Object.keys(switchModelDefaultPorts[mfr]).length === 0) delete switchModelDefaultPorts[mfr];
        }
        saveDeviceCatalog();
        return true;
    }
    n = Math.min(96, Math.max(1, n));
    if (!switchModelDefaultPorts[mfr]) switchModelDefaultPorts[mfr] = {};
    switchModelDefaultPorts[mfr][mod] = n;
    saveDeviceCatalog();
    return true;
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
    var payload = {
        nodeDeviceCatalog: cloneDeepCatalog(nodeDeviceCatalog),
        oltDeviceCatalog: cloneDeepCatalog(oltDeviceCatalog),
        onuDeviceCatalog: cloneDeepCatalog(onuDeviceCatalog),
        cameraDeviceCatalog: cloneDeepCatalog(cameraDeviceCatalog),
        switchDeviceCatalog: cloneDeepCatalog(switchDeviceCatalog),
        switchModelDefaultPorts: JSON.parse(JSON.stringify(switchModelDefaultPorts || {}))
    };
    try { localStorage.setItem(CUSTOM_DEVICE_OPTIONS_STORAGE_KEY, JSON.stringify(payload)); } catch (e) {}
    if (getApiBase() && getAuthToken()) {
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
    opts = opts || {};
    var hasLegacyData = opts && (
        (opts.manufacturers && opts.manufacturers.length > 0) ||
        (opts.modelsByManufacturer && typeof opts.modelsByManufacturer === 'object' && Object.keys(opts.modelsByManufacturer).length > 0)
    );
    if (hasLegacyData) {
        var legacyMerged = JSON.parse(JSON.stringify(DEVICE_CATALOG_DEFAULT));
        (opts.manufacturers || []).forEach(function(m) { if (m && !legacyMerged[m]) legacyMerged[m] = []; });
        if (opts.modelsByManufacturer && typeof opts.modelsByManufacturer === 'object') {
            Object.keys(opts.modelsByManufacturer).forEach(function(m) {
                if (!legacyMerged[m]) legacyMerged[m] = [];
                (opts.modelsByManufacturer[m] || []).forEach(function(mod) {
                    if (mod && legacyMerged[m].indexOf(mod) === -1) legacyMerged[m].push(mod);
                });
            });
        }
        nodeDeviceCatalog = cloneDeepCatalog(legacyMerged);
        oltDeviceCatalog = cloneDeepCatalog(legacyMerged);
        onuDeviceCatalog = cloneDeepCatalog(legacyMerged);
        if ('cameraDeviceCatalog' in opts && opts.cameraDeviceCatalog && typeof opts.cameraDeviceCatalog === 'object') {
            cameraDeviceCatalog = cloneDeepCatalog(opts.cameraDeviceCatalog);
        } else {
            cameraDeviceCatalog = cloneDeepCatalog(CAMERA_CATALOG_DEFAULT);
        }
        if ('switchDeviceCatalog' in opts && opts.switchDeviceCatalog && typeof opts.switchDeviceCatalog === 'object') {
            switchDeviceCatalog = cloneDeepCatalog(opts.switchDeviceCatalog);
        } else {
            switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
        }
        if (opts.switchModelDefaultPorts && typeof opts.switchModelDefaultPorts === 'object') {
            switchModelDefaultPorts = JSON.parse(JSON.stringify(opts.switchModelDefaultPorts));
        } else {
            switchModelDefaultPorts = {};
        }
        saveDeviceCatalog();
        return;
    }

    if (opts.nodeDeviceCatalog && typeof opts.nodeDeviceCatalog === 'object') {
        nodeDeviceCatalog = cloneDeepCatalog(opts.nodeDeviceCatalog);
    } else if (opts.deviceCatalog && typeof opts.deviceCatalog === 'object' && Object.keys(opts.deviceCatalog).length > 0) {
        nodeDeviceCatalog = cloneDeepCatalog(opts.deviceCatalog);
    } else if (!('nodeDeviceCatalog' in opts) && !('deviceCatalog' in opts)) {
        nodeDeviceCatalog = cloneDeepCatalog(NODE_CATALOG_DEFAULT);
    } else if (Object.keys(nodeDeviceCatalog).length === 0) {
        nodeDeviceCatalog = cloneDeepCatalog(NODE_CATALOG_DEFAULT);
    }

    if (opts.oltDeviceCatalog && typeof opts.oltDeviceCatalog === 'object') {
        oltDeviceCatalog = cloneDeepCatalog(opts.oltDeviceCatalog);
    } else if (opts.deviceCatalog && typeof opts.deviceCatalog === 'object' && Object.keys(opts.deviceCatalog).length > 0) {
        oltDeviceCatalog = cloneDeepCatalog(opts.deviceCatalog);
    } else if (!('oltDeviceCatalog' in opts) && !('deviceCatalog' in opts)) {
        oltDeviceCatalog = cloneDeepCatalog(OLT_CATALOG_DEFAULT);
    } else if (Object.keys(oltDeviceCatalog).length === 0) {
        oltDeviceCatalog = cloneDeepCatalog(OLT_CATALOG_DEFAULT);
    }

    if (opts.onuDeviceCatalog && typeof opts.onuDeviceCatalog === 'object') {
        onuDeviceCatalog = cloneDeepCatalog(opts.onuDeviceCatalog);
    } else if (opts.deviceCatalog && typeof opts.deviceCatalog === 'object' && Object.keys(opts.deviceCatalog).length > 0) {
        onuDeviceCatalog = cloneDeepCatalog(opts.deviceCatalog);
    } else if (!('onuDeviceCatalog' in opts) && !('deviceCatalog' in opts)) {
        onuDeviceCatalog = cloneDeepCatalog(ONU_CATALOG_DEFAULT);
    } else if (Object.keys(onuDeviceCatalog).length === 0) {
        onuDeviceCatalog = cloneDeepCatalog(ONU_CATALOG_DEFAULT);
    }

    if ('cameraDeviceCatalog' in opts && opts.cameraDeviceCatalog && typeof opts.cameraDeviceCatalog === 'object') {
        cameraDeviceCatalog = cloneDeepCatalog(opts.cameraDeviceCatalog);
    } else if (!('cameraDeviceCatalog' in opts)) {
        cameraDeviceCatalog = cloneDeepCatalog(CAMERA_CATALOG_DEFAULT);
    }

    if ('switchDeviceCatalog' in opts && opts.switchDeviceCatalog && typeof opts.switchDeviceCatalog === 'object') {
        switchDeviceCatalog = cloneDeepCatalog(opts.switchDeviceCatalog);
    } else if (!('switchDeviceCatalog' in opts)) {
        switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
    }

    if (opts.switchModelDefaultPorts && typeof opts.switchModelDefaultPorts === 'object') {
        switchModelDefaultPorts = JSON.parse(JSON.stringify(opts.switchModelDefaultPorts));
    } else {
        switchModelDefaultPorts = {};
    }

    if (mergeNodeCatalogIntoSwitch()) saveDeviceCatalog();
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

function ensureDeviceCatalogsNonEmpty() {
    if (Object.keys(nodeDeviceCatalog || {}).length === 0) nodeDeviceCatalog = cloneDeepCatalog(NODE_CATALOG_DEFAULT);
    if (Object.keys(oltDeviceCatalog || {}).length === 0) oltDeviceCatalog = cloneDeepCatalog(OLT_CATALOG_DEFAULT);
    if (Object.keys(onuDeviceCatalog || {}).length === 0) onuDeviceCatalog = cloneDeepCatalog(ONU_CATALOG_DEFAULT);
    if (Object.keys(cameraDeviceCatalog || {}).length === 0) cameraDeviceCatalog = cloneDeepCatalog(CAMERA_CATALOG_DEFAULT);
    if (Object.keys(switchDeviceCatalog || {}).length === 0) switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
    if (mergeNodeCatalogIntoSwitch()) saveDeviceCatalog();
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

function populateModelDatalistForManufacturer(manufacturer, datalistId, catalogKind) {
    datalistId = datalistId || 'deviceModelsList';
    catalogKind = catalogKind || 'node';
    if (catalogKind === 'general') catalogKind = 'node';
    var dlMod = document.getElementById(datalistId);
    if (dlMod) {
        dlMod.innerHTML = '';
        (getModelsForCatalog(catalogKind, manufacturer) || []).forEach(function(m) {
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
        var catalogKind = (wrapper.dataset.catalog || 'node').trim();
        if (catalogKind === 'general') catalogKind = 'node';
        var allowedCatalogKinds = { node: 1, olt: 1, onu: 1, camera: 1, switch: 1 };
        if (!allowedCatalogKinds[catalogKind]) catalogKind = 'node';
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
            if (type === 'manufacturer') return getManufacturersForCatalog(catalogKind) || [];
            var mfrInput = manufacturerId ? document.getElementById(manufacturerId) : null;
            var mfr = mfrInput ? (mfrInput.value || '').trim() : '';
            return getModelsForCatalog(catalogKind, mfr) || [];
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
                            var modelCombobox = container.querySelector('.device-combobox[data-type="model"][data-manufacturer-id="' + manufacturerId + '"][data-catalog="' + catalogKind + '"]')
                                || container.querySelector('.device-combobox[data-manufacturer-id="' + manufacturerId + '"]');
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
    var tab = window.deviceCatalogActiveTab || 'switch';
    if (!DEVICE_CATALOG_ALLOWED_TABS[tab]) tab = 'switch';

    var catalog = getCatalogObjectRef(tab);
    var searchQ = getDeviceCatalogSearchQuery();

    var mfrs = Object.keys(catalog).sort();
    updateDeviceCatalogChrome();

    if (mfrs.length === 0) {
        container.innerHTML =
            '<div class="device-catalog-empty">' +
            '<p class="device-catalog-empty-title">Раздел пуст</p>' +
            '<p>Нажмите «Добавить» слева или восстановите заводские значения кнопкой «Сбросить раздел».</p>' +
            '</div>';
        return;
    }

    var html = '';
    var visibleCount = 0;
    mfrs.forEach(function(mfr) {
        var models = (catalog[mfr] || []).slice();
        var matches = catalogEntryMatchesSearch(mfr, models, searchQ);
        if (matches) visibleCount++;
        var countWord = models.length === 1 ? 'модель' : (models.length >= 2 && models.length <= 4 ? 'модели' : 'моделей');
        html += '<article class="device-catalog-mfr' + (matches ? '' : ' is-hidden-by-search') + '" data-mfr="' + escapeHtml(mfr) + '">';
        html += '<header class="device-catalog-mfr-header">';
        html += '<div class="device-catalog-mfr-title">';
        html += '<span class="device-catalog-mfr-name">' + escapeHtml(mfr) + '</span>';
        html += '<span class="device-catalog-mfr-count">' + models.length + ' ' + countWord + '</span>';
        html += '</div>';
        html += '<div class="device-catalog-mfr-actions">';
        html += '<button type="button" class="device-catalog-add-model-card device-catalog-btn-add-model" data-mfr="' + escapeHtml(mfr) + '" title="Добавить модель">+ модель</button>';
        html += '<button type="button" class="device-catalog-remove-mfr device-catalog-btn-remove-mfr" data-mfr="' + escapeHtml(mfr) + '" title="Удалить производителя и все модели">Удалить</button>';
        html += '</div></header>';
        html += '<div class="device-catalog-models">';
        if (models.length === 0) {
            html += '<span class="device-catalog-mfr-count">Нет моделей — нажмите «+ Добавить»</span>';
        }
        models.forEach(function(mod) {
            html += '<span class="device-catalog-model-tag">';
            html += '<span class="device-catalog-model-name">' + escapeHtml(mod) + '</span>';
            if (tab === 'switch') {
                var defN = getSwitchModelDefaultPortCount(mfr, mod);
                html += '<label class="device-catalog-ports-label" title="Портов по умолчанию при добавлении коммутатора в узел">Портов<input type="number" class="form-input device-catalog-ports-input switch-catalog-def-ports" min="1" max="96" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" value="' + (defN != null ? String(defN) : '') + '" placeholder="—" aria-label="Портов по умолчанию"></label>';
            }
            html += '<button type="button" class="device-catalog-remove-model" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" title="Удалить модель" aria-label="Удалить модель">×</button>';
            html += '</span>';
        });
        html += '</div></article>';
    });
    if (searchQ && visibleCount === 0) {
        html += '<p class="device-catalog-no-results">Ничего не найдено по запросу «' + escapeHtml(searchQ) + '». Измените поиск или выберите другой раздел.</p>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.device-catalog-add-model-card').forEach(function(btn) {
        btn.addEventListener('click', function() {
            openDeviceCatalogEntryModal('model', btn.getAttribute('data-mfr') || '');
        });
    });
    container.querySelectorAll('.device-catalog-remove-mfr').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var mfr = btn.getAttribute('data-mfr');
            (async function() {
                if (!(await showConfirm('Удалить производителя «' + mfr + '» и все его модели?', 'Удалить производителя', { confirmText: 'Удалить' }))) return;
            if (removeManufacturerForCatalog(tab, mfr)) {
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
            if (removeModelForCatalog(tab, mfr, mod)) {
                renderDeviceCatalogList();
                populateDeviceDatalists();
                populateModelDatalistForManufacturer(mfr, 'deviceModelsList', tab);
                if (typeof showInfo === 'function') showInfo('Модель удалена', '');
            }
        });
    });
    if (tab === 'switch') {
        container.querySelectorAll('.switch-catalog-def-ports').forEach(function(inp) {
            inp.addEventListener('change', function() {
                var mf = this.getAttribute('data-mfr');
                var md = this.getAttribute('data-model');
                var v = parseInt(this.value, 10);
                if (isNaN(v) || v < 1) {
                    setSwitchModelDefaultPortCount(mf, md, null);
                    this.value = '';
                } else {
                    setSwitchModelDefaultPortCount(mf, md, v);
                    this.value = String(Math.min(96, Math.max(1, v)));
                }
            });
        });
    }
}

function getActiveDeviceCatalogTab() {
    var tab = window.deviceCatalogActiveTab || 'switch';
    if (!DEVICE_CATALOG_ALLOWED_TABS[tab]) tab = 'switch';
    return tab;
}

function setDeviceCatalogEntryType(entryType) {
    var mfrPanel = document.getElementById('deviceCatalogEntryMfrPanel');
    var modelPanel = document.getElementById('deviceCatalogEntryModelPanel');
    var isMfr = entryType === 'manufacturer';
    document.querySelectorAll('.device-catalog-entry-type').forEach(function(btn) {
        var active = btn.getAttribute('data-entry-type') === entryType;
        btn.classList.toggle('device-catalog-entry-type-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (mfrPanel) mfrPanel.hidden = !isMfr;
    if (modelPanel) modelPanel.hidden = isMfr;
}

function refreshDeviceCatalogEntryMfrSelect(preselect) {
    var sel = document.getElementById('deviceCatalogEntryMfrSelect');
    if (!sel) return;
    var tab = getActiveDeviceCatalogTab();
    var mfrs = getManufacturersForCatalog(tab);
    var prev = preselect != null ? preselect : sel.value;
    sel.innerHTML = '<option value="">— Выберите —</option>';
    mfrs.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        sel.appendChild(opt);
    });
    if (prev && mfrs.indexOf(prev) !== -1) sel.value = prev;
}

function updateDeviceCatalogEntryModalChrome() {
    var tab = getActiveDeviceCatalogTab();
    var meta = DEVICE_CATALOG_TAB_META[tab] || DEVICE_CATALOG_TAB_META.switch;
    var hint = document.getElementById('deviceCatalogEntrySectionHint');
    var portsGroup = document.getElementById('deviceCatalogEntryPortsGroup');
    if (hint) hint.textContent = 'Раздел: «' + meta.label + '». ' + meta.desc;
    if (portsGroup) portsGroup.hidden = tab !== 'switch';
}

function openDeviceCatalogEntryModal(entryType, presetMfr) {
    var modal = document.getElementById('deviceCatalogEntryModal');
    if (!modal) return;
    entryType = entryType === 'model' ? 'model' : 'manufacturer';
    updateDeviceCatalogEntryModalChrome();
    refreshDeviceCatalogEntryMfrSelect(presetMfr || '');
    setDeviceCatalogEntryType(entryType);

    var mfrNameInp = document.getElementById('deviceCatalogEntryMfrName');
    var modelNameInp = document.getElementById('deviceCatalogEntryModelName');
    var portsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
    if (mfrNameInp) mfrNameInp.value = '';
    if (modelNameInp) modelNameInp.value = '';
    if (portsInp) portsInp.value = '';
    if (entryType === 'model' && presetMfr) {
        var sel = document.getElementById('deviceCatalogEntryMfrSelect');
        if (sel) sel.value = presetMfr;
    }

    var titleEl = document.getElementById('deviceCatalogEntryModalTitle');
    if (titleEl) titleEl.textContent = entryType === 'model' ? 'Добавить модель' : 'Добавить производителя';

    modal.style.display = 'flex';
    requestAnimationFrame(function () {
        if (typeof window.initPanelPlexusCanvases === 'function') {
            window.initPanelPlexusCanvases(modal);
        }
    });
    var focusEl = entryType === 'model'
        ? (document.getElementById('deviceCatalogEntryModelName') || document.getElementById('deviceCatalogEntryMfrSelect'))
        : document.getElementById('deviceCatalogEntryMfrName');
    if (focusEl) setTimeout(function() { focusEl.focus(); }, 50);
}

function closeDeviceCatalogEntryModal() {
    var modal = document.getElementById('deviceCatalogEntryModal');
    if (modal) modal.style.display = 'none';
}

function saveDeviceCatalogEntry() {
    var tab = getActiveDeviceCatalogTab();
    var entryType = document.querySelector('.device-catalog-entry-type-active');
    var type = entryType ? entryType.getAttribute('data-entry-type') : 'manufacturer';

    if (type === 'manufacturer') {
        var nameInp = document.getElementById('deviceCatalogEntryMfrName');
        var name = nameInp ? nameInp.value.trim() : '';
        if (!name) {
            if (typeof showError === 'function') showError('Введите название производителя', '');
            return;
        }
        if (addManufacturerForCatalog(tab, name)) {
            closeDeviceCatalogEntryModal();
            renderDeviceCatalogList();
            populateDeviceDatalists();
            if (typeof showInfo === 'function') showInfo('Производитель добавлен', '');
        } else if (typeof showError === 'function') showError('Производитель уже существует', '');
        return;
    }

    var sel = document.getElementById('deviceCatalogEntryMfrSelect');
    var mfr = sel ? sel.value.trim() : '';
    if (!mfr) {
        if (typeof showError === 'function') showError('Выберите производителя', '');
        return;
    }
    var modelInp = document.getElementById('deviceCatalogEntryModelName');
    var model = modelInp ? modelInp.value.trim() : '';
    if (!model) {
        if (typeof showError === 'function') showError('Введите модель устройства', '');
        return;
    }
    var cat = getCatalogObjectRef(tab);
    if (cat[mfr] && cat[mfr].indexOf(model) !== -1) {
        if (typeof showError === 'function') showError('Такая модель уже есть у этого производителя', '');
        return;
    }
    if (!addModelForCatalog(tab, mfr, model)) return;

    if (tab === 'switch') {
        var portsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
        var pv = portsInp ? parseInt(portsInp.value, 10) : NaN;
        if (!isNaN(pv) && pv >= 1) setSwitchModelDefaultPortCount(mfr, model, Math.min(96, pv));
    }

    closeDeviceCatalogEntryModal();
    renderDeviceCatalogList();
    populateDeviceDatalists();
    populateModelDatalistForManufacturer(mfr, 'deviceModelsList', tab);
    if (typeof showInfo === 'function') showInfo('Модель добавлена', '');
}

function setupDeviceCatalogEntryHandlers() {
    var entryModal = document.getElementById('deviceCatalogEntryModal');
    if (!entryModal || entryModal._deviceCatalogEntryBound) return;
    entryModal._deviceCatalogEntryBound = true;

    entryModal.querySelectorAll('.device-catalog-entry-type').forEach(function(btn) {
        btn.addEventListener('click', function() {
            setDeviceCatalogEntryType(btn.getAttribute('data-entry-type'));
            refreshDeviceCatalogEntryMfrSelect();
        });
    });

    var saveBtn = document.getElementById('deviceCatalogEntrySave');
    if (saveBtn) saveBtn.addEventListener('click', saveDeviceCatalogEntry);

    var cancelBtn = document.getElementById('deviceCatalogEntryCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeviceCatalogEntryModal);

    var closeBtn = document.querySelector('.close-device-catalog-entry');
    if (closeBtn) closeBtn.addEventListener('click', closeDeviceCatalogEntryModal);

    entryModal.addEventListener('click', function(e) {
        if (e.target === entryModal) closeDeviceCatalogEntryModal();
    });

    ['deviceCatalogEntryMfrName', 'deviceCatalogEntryModelName'].forEach(function(id) {
        var inp = document.getElementById(id);
        if (inp) {
            inp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveDeviceCatalogEntry();
                }
            });
        }
    });
}

function setupDeviceCatalogHandlers() {
    var openAddBtn = document.getElementById('deviceCatalogOpenAddBtn');
    var resetBtn = document.getElementById('deviceCatalogReset');
    var searchInp = document.getElementById('deviceCatalogSearch');
    var catModal = document.getElementById('deviceCatalogModal');

    setupDeviceCatalogEntryHandlers();

    if (searchInp && !searchInp._deviceCatalogSearchBound) {
        searchInp._deviceCatalogSearchBound = true;
        searchInp.addEventListener('input', function() {
            applyDeviceCatalogSearchFilter();
        });
    }
    if (catModal && !catModal._deviceCatalogTabBound) {
        catModal._deviceCatalogTabBound = true;
        catModal.addEventListener('click', function(e) {
            var b = e.target.closest('.device-catalog-tab');
            if (!b || !catModal.contains(b)) return;
            var t = b.getAttribute('data-tab');
            if (!t || !DEVICE_CATALOG_ALLOWED_TABS[t]) return;
            window.deviceCatalogActiveTab = t;
            syncDeviceCatalogTabButtons();
            renderDeviceCatalogList();
        });
    }
    if (openAddBtn && !openAddBtn._deviceCatalogAddBound) {
        openAddBtn._deviceCatalogAddBound = true;
        openAddBtn.addEventListener('click', function() {
            openDeviceCatalogEntryModal('manufacturer');
        });
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            (async function() {
                var tab = getActiveDeviceCatalogTab();
                var meta = DEVICE_CATALOG_TAB_META[tab] || DEVICE_CATALOG_TAB_META.switch;
                if (!(await showConfirm(
                    'Сбросить раздел «' + meta.label + '» к заводским значениям? Ваши правки в этом разделе будут заменены.',
                    'Сброс раздела',
                    { confirmText: 'Сбросить' }
                ))) return;
                resetDeviceCatalogTabToDefault(tab);
                renderDeviceCatalogList();
                populateDeviceDatalists();
                if (typeof showInfo === 'function') showInfo('Раздел «' + meta.label + '» сброшен', '');
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

    const firstAccordion = document.querySelector('.accordion-section:not([data-accordion-initial="closed"])');
    if (firstAccordion) {
        firstAccordion.classList.add('active');
    }

    setupDeviceCatalogHandlers();
}

function openDeviceCatalogModal() {
    if (typeof requireAdmin === 'function' && !requireAdmin()) return;
    var modal = document.getElementById('deviceCatalogModal');
    if (modal) {
        window.deviceCatalogActiveTab = 'switch';
        syncDeviceCatalogTabButtons();
        var searchInp = document.getElementById('deviceCatalogSearch');
        if (searchInp) searchInp.value = '';
        modal.classList.add('device-catalog-modal-open');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        renderDeviceCatalogList();
        requestAnimationFrame(function () {
            if (typeof window.initPanelPlexusCanvases === 'function') {
                window.initPanelPlexusCanvases(modal);
            }
        });
    }
}

function closeDeviceCatalogModal() {
    closeDeviceCatalogEntryModal();
    var modal = document.getElementById('deviceCatalogModal');
    if (modal) {
        modal.classList.remove('device-catalog-modal-open');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function setupDeviceCatalogModalHandlers() {
    var closeBtn = document.querySelector('.close-device-catalog');
    if (closeBtn) closeBtn.addEventListener('click', closeDeviceCatalogModal);
    var modal = document.getElementById('deviceCatalogModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target !== modal) return;
            var entry = document.getElementById('deviceCatalogEntryModal');
            if (entry && entry.style.display && entry.style.display !== 'none') return;
            closeDeviceCatalogModal();
        });
    }
}
