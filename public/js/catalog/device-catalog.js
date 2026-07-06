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

/** Справочник Wi‑Fi радиомостов (P2P / P2MP). */
var RADIO_BRIDGE_CATALOG_DEFAULT = {
    'Ubiquiti': ['NanoStation M5', 'NanoBeam M5', 'PowerBeam M5', 'LiteBeam M5', 'airFiber 5X HD'],
    'MikroTik': ['SXTsq 5 ac', 'Disc Lite5 ac', 'LHG 5', 'NetMetal ac²'],
    'Cambium': ['ePMP Force 300-25', 'ePMP Force 200', 'ePMP 1000L', 'PTP 550'],
    'LigoWave': ['NFT 2ac', 'PTP RapidFire', 'Infinity NFT'],
    'Radwin': ['2000-O', '5000-J', '6000'],
    'Telrad': ['BS 6520', 'CPE 6500'],
    'BDCOM': ['WBS-2400', 'WBS-5800'],
    'SNR': ['SNR-WB-5M', 'SNR-WB-5D']
};

/** Справочник типов оптического кабеля (марка и модель/маркировка). */
var CABLE_CATALOG_DEFAULT = {
    'SNR': ['ОКЛК-01', 'ОКЛК-02', 'ОКЛК-03', 'ОКГТ-А-4', 'ОКГТ-А-8', 'ОКГТ-А-12', 'ОКГТ-А-24', 'ОКГТ-А-48'],
    'Incab': ['ОКГТ-А-4', 'ОКГТ-А-8', 'ОКГТ-А-12', 'ОКГТ-А-24', 'ОКГТ-А-48', 'ОКГТ-А-96'],
    'Corning': ['SMF-28', 'FREEDM One', 'Altos'],
    'Furukawa': ['FITEL', 'LITEAD'],
    'Yangtze': ['GYTA', 'GYTS', 'GYTA53'],
    'Opten': ['ОКГТ-А-4', 'ОКГТ-А-8', 'ОКГТ-А-12', 'ОКГТ-А-24'],
    'General Cable': ['Lo-Soft', 'Standard']
};

/** Справочник ящиков / шкафов / боксов на карте. */
var CABINET_CATALOG_DEFAULT = {
    'SNR': ['ШУН-4', 'ШУН-8', 'ШУН-12', 'БУОС-5', 'БУОК-2', 'ШУО-145', 'ШТК-19-9U'],
    'Eltex': ['УББ-4', 'УББ-8', 'УО-1', 'ШТК-19'],
    'НЗОТ': ['ШТК-19-9U', 'ШТО-145', 'ШТО-60'],
    'ZPAS': ['ШТК-19', 'ШНО', 'ШТО'],
    'Huawei': ['ODN-Splitter Box', 'FAU'],
    'Dahua': ['PFA120', 'PFA130', 'PFA140'],
    'Hikvision': ['DS-7104NI', 'DS-7608NI'],
    'Generic': ['Настенный бокс', 'Уличный шкаф', 'Бокс на опоре', 'Колодец связи']
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

/** Встроенные типы муфт: id, подпись в списке, макс. волокон (0 — без лимита). */
var SLEEVE_TYPES_BUILTIN = [
    { id: 'SNR-FOSC-04', label: 'SNR-FOSC-04 (4 волокна)', maxFibers: 4 },
    { id: 'SNR-FOSC-X', label: 'SNR-FOSC-X (компактная)', maxFibers: 12 },
    { id: 'SNR-FOSC-12', label: 'SNR-FOSC-12 (12 волокон)', maxFibers: 12 },
    { id: 'SNR-FOSC-D', label: 'SNR-FOSC-D (до 24 волокон)', maxFibers: 24 },
    { id: 'SNR-FOSC-M', label: 'SNR-FOSC-M (до 48 волокон)', maxFibers: 48 },
    { id: 'SNR-FOSC-G', label: 'SNR-FOSC-G (до 72 волокон)', maxFibers: 72 },
    { id: 'SNR-FOSC-L', label: 'SNR-FOSC-L (до 96 волокон)', maxFibers: 96 },
    { id: 'SNR-FOSC-B', label: 'SNR-FOSC-B (до 144 волокон)', maxFibers: 144 },
    { id: 'SNR-FOSC-UF2', label: 'SNR-FOSC-UF2 (универсальная)', maxFibers: 144 },
    { id: 'SNR-FOSC-CV018', label: 'SNR-FOSC-CV018 (купольная)', maxFibers: 36 },
    { id: 'SNR-FOSC-CV019', label: 'SNR-FOSC-CV019 (тупиковая)', maxFibers: 36 },
    { id: 'SNR-FOSC-CV021', label: 'SNR-FOSC-CV021 (96 волокон)', maxFibers: 96 },
    { id: 'SNR-FOSC-CV028A', label: 'SNR-FOSC-CV028A', maxFibers: 36 },
    { id: 'SNR-FOSC-CV037', label: 'SNR-FOSC-CV037', maxFibers: 36 },
    { id: 'SNR-FOSC-Q-T', label: 'SNR-FOSC-Q-T', maxFibers: 36 },
    { id: 'SNR-FOSC-D-T', label: 'SNR-FOSC-D-T', maxFibers: 24 },
    { id: 'SNR-FOSC-CH009', label: 'SNR-FOSC-CH009 (проходная)', maxFibers: 24 },
    { id: 'SNR-FOSC-CH018', label: 'SNR-FOSC-CH018 (проходная)', maxFibers: 36 },
    { id: 'SNR-FOSC-CH019', label: 'SNR-FOSC-CH019 (проходная)', maxFibers: 36 },
    { id: 'SNR-FOSC-CH025', label: 'SNR-FOSC-CH025 (проходная)', maxFibers: 24 },
    { id: 'SNR-FT-E', label: 'SNR-FT-E', maxFibers: 12 },
    { id: 'МВОТ-108-3-Т-1-36', label: 'МВОТ-108-3-Т-1-36 (108 волокон)', maxFibers: 108 },
    { id: 'МВОТ-216-4-Т-1-36', label: 'МВОТ-216-4-Т-1-36 (216 волокон)', maxFibers: 216 },
    { id: 'МВОТ-3611-22-32-2К16', label: 'МВОТ-3611-22-32-2К16', maxFibers: 32 },
    { id: 'МОГ-У-33-1К4845', label: 'МОГ-У-33-1К4845 ССД', maxFibers: 33 },
    { id: 'МКО-Ц8/С09-5SC', label: 'МКО-Ц8/С09-5SC (кросс-муфта)', maxFibers: 18 },
    { id: 'МТОК-Ф3/216-1КТ3645-К', label: 'МТОК-Ф3/216-1КТ3645-К', maxFibers: 216 },
    { id: 'KSC-MURR', label: 'KSC LIGHT PON МУРР (до 12 волокон)', maxFibers: 12 },
    { id: '101-01-18', label: '101-01-18 (кросс-муфта FTTH, до 18SC)', maxFibers: 18 },
    { id: 'custom', label: 'Пользовательская (вручную на карте)', maxFibers: 0 }
];

/** Встроенные типы кроссов: id, подпись в списке, портов по умолчанию. */
var CROSS_TYPES_BUILTIN = [
    { id: 'SNR-ODF-W4', label: 'SNR-ODF-W4 (4 порта)', defaultPorts: 4 },
    { id: 'SNR-ODF-W8', label: 'SNR-ODF-W8 (8 портов)', defaultPorts: 8 },
    { id: 'SNR-ODF-W12', label: 'SNR-ODF-W12 (12 портов)', defaultPorts: 12 },
    { id: 'SNR-ODF-W16', label: 'SNR-ODF-W16 (16 портов)', defaultPorts: 16 },
    { id: 'SNR-ODF-W24', label: 'SNR-ODF-W24 (24 порта)', defaultPorts: 24 },
    { id: 'SNR-ODF-W48', label: 'SNR-ODF-W48 (48 портов)', defaultPorts: 48 },
    { id: 'SNR-ODF-W96', label: 'SNR-ODF-W96 (96 портов)', defaultPorts: 96 },
    { id: 'SNR-ODF-19-12', label: 'SNR-ODF-19 12SC (стоечный)', defaultPorts: 12 },
    { id: 'SNR-ODF-19-24', label: 'SNR-ODF-19 24SC (стоечный)', defaultPorts: 24 },
    { id: 'SNR-ODF-19-48', label: 'SNR-ODF-19 48SC (стоечный)', defaultPorts: 48 },
    { id: 'SNR-ODF-19-96', label: 'SNR-ODF-19 96SC (стоечный)', defaultPorts: 96 },
    { id: 'custom', label: 'Пользовательский (вручную на карте)', defaultPorts: 24 }
];

/** Дополнительные типы муфт из справочника: { id, label, maxFibers }. */
var customSleeveTypes = [];
/** Скрытые встроенные типы муфт (удалены из списка, но остаются на уже созданных объектах). */
var hiddenBuiltinSleeveTypes = [];
/** Дополнительные типы кроссов из справочника: { id, label, defaultPorts }. */
var customCrossTypes = [];
/** Скрытые встроенные типы кроссов. */
var hiddenBuiltinCrossTypes = [];

/** Встроенные типы сплайс-кассет: id, подпись, макс. волокон (0 — без лимита). */
var SPLICE_CASSETTE_TYPES_BUILTIN = [
    { id: 'SC-12', label: 'Сплайс-кассета 12F', maxFibers: 12 },
    { id: 'SC-24', label: 'Сплайс-кассета 24F', maxFibers: 24 },
    { id: 'SC-48', label: 'Сплайс-кассета 48F', maxFibers: 48 },
    { id: 'SNR-SC-12', label: 'SNR-SC-12 (12 волокон)', maxFibers: 12 },
    { id: 'SNR-SC-24', label: 'SNR-SC-24 (24 волокна)', maxFibers: 24 },
    { id: 'SNR-SC-48', label: 'SNR-SC-48 (48 волокон)', maxFibers: 48 },
    { id: 'SNR-LC-12', label: 'SNR-LC-12 (12 LC-адаптеров)', maxFibers: 12 },
    { id: 'SNR-LC-24', label: 'SNR-LC-24 (24 LC-адаптера)', maxFibers: 24 },
    { id: 'SNR-LC-48', label: 'SNR-LC-48 (48 LC-адаптеров)', maxFibers: 48 },
    { id: 'CFO-12', label: 'CFO-12 (кассета 12F)', maxFibers: 12 },
    { id: 'CFO-24', label: 'CFO-24 (кассета 24F)', maxFibers: 24 },
    { id: 'CFO-48', label: 'CFO-48 (кассета 48F)', maxFibers: 48 },
    { id: 'ODF-SC-12', label: 'ODF-SC-12 (12 SC)', maxFibers: 12 },
    { id: 'ODF-SC-24', label: 'ODF-SC-24 (24 SC)', maxFibers: 24 },
    { id: 'ODF-SC-48', label: 'ODF-SC-48 (48 SC)', maxFibers: 48 },
    { id: 'custom', label: 'Пользовательская (вручную)', maxFibers: 0 }
];

/** Дополнительные типы сплайс-кассет из справочника. */
var customSpliceCassetteTypes = [];
/** Скрытые встроенные типы сплайс-кассет. */
var hiddenBuiltinSpliceCassetteTypes = [];

function normalizeSleeveTypeId(id) {
    return (id || '').trim();
}

function normalizeSleeveMaxFibers(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 0) return 0;
    return Math.min(288, v);
}

function getBuiltinSleeveTypes() {
    return SLEEVE_TYPES_BUILTIN.slice();
}

function getCustomSleeveTypes() {
    return (customSleeveTypes || []).slice();
}

function findSleeveTypeById(id) {
    var sid = normalizeSleeveTypeId(id);
    if (!sid) return null;
    var i;
    for (i = 0; i < SLEEVE_TYPES_BUILTIN.length; i++) {
        if (SLEEVE_TYPES_BUILTIN[i].id === sid) return Object.assign({ builtin: true }, SLEEVE_TYPES_BUILTIN[i]);
    }
    for (i = 0; i < (customSleeveTypes || []).length; i++) {
        if (customSleeveTypes[i].id === sid) return Object.assign({ builtin: false }, customSleeveTypes[i]);
    }
    return null;
}

function getHiddenBuiltinSleeveTypes() {
    return (hiddenBuiltinSleeveTypes || []).slice();
}

function isBuiltinSleeveTypeHidden(id) {
    id = normalizeSleeveTypeId(id);
    if (!id) return false;
    return (hiddenBuiltinSleeveTypes || []).indexOf(id) !== -1;
}

function getAllSleeveTypes() {
    var out = [];
    var hidden = hiddenBuiltinSleeveTypes || [];
    SLEEVE_TYPES_BUILTIN.forEach(function(t) {
        if (hidden.indexOf(t.id) === -1) {
            out.push(Object.assign({ builtin: true }, t));
        }
    });
    (customSleeveTypes || []).forEach(function(t) {
        out.push(Object.assign({ builtin: false }, t));
    });
    return out;
}

function getDefaultMaxFibersForSleeveType(sleeveType) {
    return 0;
}

function formatSleeveMaxFibersHint(maxFibers) {
    return 'без лимита';
}

function getSleeveTypeSelectOptionsHtml(selectedValue) {
    var sel = (selectedValue != null && selectedValue !== '') ? String(selectedValue) : '';
    var html = '';
    if (!sel) {
        html += '<option value="" selected>— Не указано —</option>';
    }
    var found = false;
    getAllSleeveTypes().forEach(function(t) {
        if (t.id === sel) found = true;
        html += '<option value="' + escapeHtml(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>';
    });
    if (sel && !found) {
        html += '<option value="' + escapeHtml(sel) + '" selected>' + escapeHtml(sel) + '</option>';
    }
    return html;
}

function populateSleeveTypeSelect(selectEl, selectedValue) {
    if (!selectEl) return;
    var prev = selectedValue != null ? selectedValue : selectEl.value;
    selectEl.innerHTML = getSleeveTypeSelectOptionsHtml(prev);
}

function refreshAllSleeveTypeSelects() {
    populateSleeveTypeSelect(document.getElementById('sleeveType'));
    document.querySelectorAll('.cable-split-sleeve-type').forEach(function(el) {
        populateSleeveTypeSelect(el, el.value);
        if (typeof bindCableSplitSleeveFields === 'function') bindCableSplitSleeveFields(el.closest('.cable-split-sleeve-fields') || el.parentElement);
    });
    var editSel = document.getElementById('editSleeveType');
    if (editSel) populateSleeveTypeSelect(editSel, editSel.value);
}

function addCustomSleeveType(id, label, maxFibers) {
    id = normalizeSleeveTypeId(id);
    if (!id) return false;
    if (findSleeveTypeById(id)) return false;
    label = (label || '').trim() || id;
    customSleeveTypes.push({
        id: id,
        label: label,
        maxFibers: normalizeSleeveMaxFibers(maxFibers)
    });
    customSleeveTypes.sort(function(a, b) {
        return String(a.label).localeCompare(String(b.label), 'ru');
    });
    saveDeviceCatalog();
    return true;
}

function removeCustomSleeveType(id) {
    id = normalizeSleeveTypeId(id);
    var idx = -1;
    (customSleeveTypes || []).forEach(function(t, i) {
        if (t.id === id) idx = i;
    });
    if (idx === -1) return false;
    customSleeveTypes.splice(idx, 1);
    saveDeviceCatalog();
    return true;
}

function hideBuiltinSleeveType(id) {
    id = normalizeSleeveTypeId(id);
    if (!id || isBuiltinSleeveTypeHidden(id)) return false;
    var found = false;
    for (var i = 0; i < SLEEVE_TYPES_BUILTIN.length; i++) {
        if (SLEEVE_TYPES_BUILTIN[i].id === id) {
            found = true;
            break;
        }
    }
    if (!found) return false;
    hiddenBuiltinSleeveTypes.push(id);
    hiddenBuiltinSleeveTypes.sort(function(a, b) {
        return String(a).localeCompare(String(b), 'ru');
    });
    saveDeviceCatalog();
    return true;
}

function removeSleeveType(id) {
    id = normalizeSleeveTypeId(id);
    if (!id) return false;
    var found = findSleeveTypeById(id);
    if (!found) return false;
    if (found.builtin) return hideBuiltinSleeveType(id);
    return removeCustomSleeveType(id);
}

function resetCustomSleeveTypes() {
    customSleeveTypes = [];
    saveDeviceCatalog();
}

function resetSleeveCatalogToDefault() {
    customSleeveTypes = [];
    hiddenBuiltinSleeveTypes = [];
    saveDeviceCatalog();
}

function normalizeCrossTypeId(id) {
    return (id || '').trim();
}

function normalizeCrossDefaultPorts(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 1) return 24;
    return Math.min(96, v);
}

function getBuiltinCrossTypes() {
    return CROSS_TYPES_BUILTIN.slice();
}

function getCustomCrossTypes() {
    return (customCrossTypes || []).slice();
}

function findCrossTypeById(id) {
    var sid = normalizeCrossTypeId(id);
    if (!sid) return null;
    var i;
    for (i = 0; i < CROSS_TYPES_BUILTIN.length; i++) {
        if (CROSS_TYPES_BUILTIN[i].id === sid) return Object.assign({ builtin: true }, CROSS_TYPES_BUILTIN[i]);
    }
    for (i = 0; i < (customCrossTypes || []).length; i++) {
        if (customCrossTypes[i].id === sid) return Object.assign({ builtin: false }, customCrossTypes[i]);
    }
    return null;
}

function getCrossTypeLabel(id) {
    var t = findCrossTypeById(id);
    return t ? t.label : ((id || '').trim() || 'Не указан');
}

function getDefaultPortsForCrossType(crossType) {
    var t = findCrossTypeById(crossType);
    if (t && t.defaultPorts) return normalizeCrossDefaultPorts(t.defaultPorts);
    return 24;
}

function getHiddenBuiltinCrossTypes() {
    return (hiddenBuiltinCrossTypes || []).slice();
}

function isBuiltinCrossTypeHidden(id) {
    id = normalizeCrossTypeId(id);
    if (!id) return false;
    return (hiddenBuiltinCrossTypes || []).indexOf(id) !== -1;
}

function getAllCrossTypes() {
    var out = [];
    var hidden = hiddenBuiltinCrossTypes || [];
    CROSS_TYPES_BUILTIN.forEach(function(t) {
        if (hidden.indexOf(t.id) === -1) {
            out.push(Object.assign({ builtin: true }, t));
        }
    });
    (customCrossTypes || []).forEach(function(t) {
        out.push(Object.assign({ builtin: false }, t));
    });
    return out;
}

function formatCrossDefaultPortsHint(defaultPorts) {
    var n = normalizeCrossDefaultPorts(defaultPorts);
    return n + ' порт.';
}

function getCrossTypeSelectOptionsHtml(selectedValue) {
    var sel = (selectedValue != null && selectedValue !== '') ? String(selectedValue) : '';
    var html = '';
    if (!sel) {
        html += '<option value="" selected>— Не указано —</option>';
    }
    var found = false;
    getAllCrossTypes().forEach(function(t) {
        if (t.id === sel) found = true;
        html += '<option value="' + escapeHtml(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>';
    });
    if (sel && !found) {
        html += '<option value="' + escapeHtml(sel) + '" selected>' + escapeHtml(sel) + '</option>';
    }
    return html;
}

function populateCrossTypeSelect(selectEl, selectedValue) {
    if (!selectEl) return;
    var prev = selectedValue != null ? selectedValue : selectEl.value;
    selectEl.innerHTML = getCrossTypeSelectOptionsHtml(prev);
}

function refreshAllCrossTypeSelects() {
    populateCrossTypeSelect(document.getElementById('crossType'));
    var editSel = document.getElementById('editCrossType');
    if (editSel) populateCrossTypeSelect(editSel, editSel.value);
}

function addCustomCrossType(id, label, defaultPorts) {
    id = normalizeCrossTypeId(id);
    if (!id) return false;
    if (findCrossTypeById(id)) return false;
    label = (label || '').trim() || id;
    customCrossTypes.push({
        id: id,
        label: label,
        defaultPorts: normalizeCrossDefaultPorts(defaultPorts)
    });
    customCrossTypes.sort(function(a, b) {
        return String(a.label).localeCompare(String(b.label), 'ru');
    });
    saveDeviceCatalog();
    return true;
}

function removeCustomCrossType(id) {
    id = normalizeCrossTypeId(id);
    var idx = -1;
    (customCrossTypes || []).forEach(function(t, i) {
        if (t.id === id) idx = i;
    });
    if (idx === -1) return false;
    customCrossTypes.splice(idx, 1);
    saveDeviceCatalog();
    return true;
}

function hideBuiltinCrossType(id) {
    id = normalizeCrossTypeId(id);
    if (!id || isBuiltinCrossTypeHidden(id)) return false;
    var found = false;
    for (var i = 0; i < CROSS_TYPES_BUILTIN.length; i++) {
        if (CROSS_TYPES_BUILTIN[i].id === id) {
            found = true;
            break;
        }
    }
    if (!found) return false;
    hiddenBuiltinCrossTypes.push(id);
    hiddenBuiltinCrossTypes.sort(function(a, b) {
        return String(a).localeCompare(String(b), 'ru');
    });
    saveDeviceCatalog();
    return true;
}

function removeCrossType(id) {
    id = normalizeCrossTypeId(id);
    if (!id) return false;
    var found = findCrossTypeById(id);
    if (!found) return false;
    if (found.builtin) return hideBuiltinCrossType(id);
    return removeCustomCrossType(id);
}

function resetCrossCatalogToDefault() {
    customCrossTypes = [];
    hiddenBuiltinCrossTypes = [];
    saveDeviceCatalog();
}

function normalizeSpliceCassetteTypeId(id) {
    return (id || '').trim();
}

function normalizeSpliceCassetteMaxFibers(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 0) return 0;
    return Math.min(288, v);
}

function getBuiltinSpliceCassetteTypes() {
    return SPLICE_CASSETTE_TYPES_BUILTIN.slice();
}

function getCustomSpliceCassetteTypes() {
    return (customSpliceCassetteTypes || []).slice();
}

function findSpliceCassetteTypeById(id) {
    var sid = normalizeSpliceCassetteTypeId(id);
    if (!sid) return null;
    var i;
    for (i = 0; i < SPLICE_CASSETTE_TYPES_BUILTIN.length; i++) {
        if (SPLICE_CASSETTE_TYPES_BUILTIN[i].id === sid) return Object.assign({ builtin: true }, SPLICE_CASSETTE_TYPES_BUILTIN[i]);
    }
    for (i = 0; i < (customSpliceCassetteTypes || []).length; i++) {
        if (customSpliceCassetteTypes[i].id === sid) return Object.assign({ builtin: false }, customSpliceCassetteTypes[i]);
    }
    return null;
}

function getHiddenBuiltinSpliceCassetteTypes() {
    return (hiddenBuiltinSpliceCassetteTypes || []).slice();
}

function isBuiltinSpliceCassetteTypeHidden(id) {
    id = normalizeSpliceCassetteTypeId(id);
    if (!id) return false;
    return (hiddenBuiltinSpliceCassetteTypes || []).indexOf(id) !== -1;
}

function getAllSpliceCassetteTypes() {
    var out = [];
    var hidden = hiddenBuiltinSpliceCassetteTypes || [];
    SPLICE_CASSETTE_TYPES_BUILTIN.forEach(function(t) {
        if (hidden.indexOf(t.id) === -1) {
            out.push(Object.assign({ builtin: true }, t));
        }
    });
    (customSpliceCassetteTypes || []).forEach(function(t) {
        out.push(Object.assign({ builtin: false }, t));
    });
    return out;
}

function getDefaultMaxFibersForCassetteType(cassetteType) {
    var t = findSpliceCassetteTypeById(cassetteType);
    return t ? t.maxFibers : 0;
}

function getSpliceCassetteTypeLabel(id) {
    var t = findSpliceCassetteTypeById(id);
    return t ? t.label : ((id && String(id)) || 'Не указан');
}

function formatSpliceCassetteMaxFibersHint(maxFibers) {
    var n = parseInt(maxFibers, 10);
    if (!n || isNaN(n)) return 'без лимита';
    return 'до ' + n + ' волокон';
}

function getSpliceCassetteTypeSelectOptionsHtml(selectedValue) {
    var sel = (selectedValue != null && selectedValue !== '') ? String(selectedValue) : '';
    var html = '';
    if (!sel) {
        html += '<option value="" selected>— Не указано —</option>';
    }
    var found = false;
    getAllSpliceCassetteTypes().forEach(function(t) {
        if (t.id === sel) found = true;
        html += '<option value="' + escapeHtml(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>';
    });
    if (sel && !found) {
        html += '<option value="' + escapeHtml(sel) + '" selected>' + escapeHtml(sel) + '</option>';
    }
    return html;
}

function populateSpliceCassetteTypeSelect(selectEl, selectedValue) {
    if (!selectEl) return;
    var prev = selectedValue != null ? selectedValue : selectEl.value;
    selectEl.innerHTML = getSpliceCassetteTypeSelectOptionsHtml(prev);
}

function refreshAllSpliceCassetteTypeSelects() {
    populateSpliceCassetteTypeSelect(document.getElementById('cabinetCreateCassetteType'));
    var editSel = document.getElementById('editCassetteType');
    if (editSel) populateSpliceCassetteTypeSelect(editSel, editSel.value);
}

function addCustomSpliceCassetteType(id, label, maxFibers) {
    id = normalizeSpliceCassetteTypeId(id);
    if (!id) return false;
    if (findSpliceCassetteTypeById(id)) return false;
    label = (label || '').trim() || id;
    customSpliceCassetteTypes.push({
        id: id,
        label: label,
        maxFibers: normalizeSpliceCassetteMaxFibers(maxFibers)
    });
    customSpliceCassetteTypes.sort(function(a, b) {
        return String(a.label).localeCompare(String(b.label), 'ru');
    });
    saveDeviceCatalog();
    return true;
}

function removeCustomSpliceCassetteType(id) {
    id = normalizeSpliceCassetteTypeId(id);
    var idx = -1;
    (customSpliceCassetteTypes || []).forEach(function(t, i) {
        if (t.id === id) idx = i;
    });
    if (idx === -1) return false;
    customSpliceCassetteTypes.splice(idx, 1);
    saveDeviceCatalog();
    return true;
}

function hideBuiltinSpliceCassetteType(id) {
    id = normalizeSpliceCassetteTypeId(id);
    if (!id || isBuiltinSpliceCassetteTypeHidden(id)) return false;
    var found = false;
    for (var i = 0; i < SPLICE_CASSETTE_TYPES_BUILTIN.length; i++) {
        if (SPLICE_CASSETTE_TYPES_BUILTIN[i].id === id) {
            found = true;
            break;
        }
    }
    if (!found) return false;
    hiddenBuiltinSpliceCassetteTypes.push(id);
    hiddenBuiltinSpliceCassetteTypes.sort(function(a, b) {
        return String(a).localeCompare(String(b), 'ru');
    });
    saveDeviceCatalog();
    return true;
}

function removeSpliceCassetteType(id) {
    id = normalizeSpliceCassetteTypeId(id);
    if (!id) return false;
    var found = findSpliceCassetteTypeById(id);
    if (!found) return false;
    if (found.builtin) return hideBuiltinSpliceCassetteType(id);
    return removeCustomSpliceCassetteType(id);
}

function resetSpliceCassetteCatalogToDefault() {
    customSpliceCassetteTypes = [];
    hiddenBuiltinSpliceCassetteTypes = [];
    saveDeviceCatalog();
}

var nodeDeviceCatalog = {};
var oltDeviceCatalog = {};
var onuDeviceCatalog = {};
var cameraDeviceCatalog = {};
var radioBridgeDeviceCatalog = {};
var cabinetDeviceCatalog = {};
var switchDeviceCatalog = {};
var cableDeviceCatalog = {};
/** switchModelDefaultPorts[manufacturer][model] = число портов по умолчанию при добавлении коммутатора. */
var switchModelDefaultPorts = {};
/** radioBridgeModelDefaultPorts[manufacturer][model] = число Ethernet-портов по умолчанию при добавлении радиомоста. */
var radioBridgeModelDefaultPorts = {};
/** switchModelPortTypes[manufacturer][model] = массив типов портов (по одному на порт). */
var switchModelPortTypes = {};
/** oltModelDefaultPorts[manufacturer][model] = число PON-портов по умолчанию. */
var oltModelDefaultPorts = {};
/** oltModelPortTypes[manufacturer][model] = массив типов PON-портов. */
var oltModelPortTypes = {};

/** Тип порта RJ45 по умолчанию при добавлении коммутатора. */
var SWITCH_PORT_DEFAULT_KIND = 'RJ45 1000Base-T (Gigabit, порт G)';

var SWITCH_PORT_KIND_OPTIONS = [
    'RJ45 10Base-T (10 Мбит/с)',
    'RJ45 100Base-T (Fast Ethernet, порт F)',
    'RJ45 1000Base-T (Gigabit, порт G)',
    'RJ45 2.5G (2.5G Ethernet)',
    'RJ45 5G (5G Ethernet)',
    'RJ45 10G (10G Ethernet)',
    'RJ45 PoE',
    'RJ45 PoE+',
    'RJ45 PoE++',
    'GBIC (1G, устар.)',
    'SFP (mini-GBIC, 1G)',
    'SFP+ (10G)',
    'SFP28 (25G)',
    'SFP56 (50G)',
    'XFP (10G)',
    'X2 (10G, устар.)',
    'XENPAK (10G, устар.)',
    'CFP (40G)',
    'CFP2 (100G)',
    'CFP4 (100G)',
    'QSFP+ (40G)',
    'QSFP28 (100G)',
    'QSFP56 (50G/200G)',
    'QSFP-DD (400G/800G)',
    'OSFP (400G/800G)',
    'FC (Fibre Channel, 2–128G)',
    'Комбо RJ45/SFP',
    'Комбо RJ45/SFP+',
    'Консоль',
    'Uplink/stack'
];

/** Старые короткие подписи → актуальные из справочника (для сохранённых моделей). */
var SWITCH_PORT_LEGACY_LABELS = {
    'RJ45 10/100': 'RJ45 100Base-T (Fast Ethernet, порт F)',
    'RJ45 10/100/1000': SWITCH_PORT_DEFAULT_KIND,
    'RJ45 2.5G': 'RJ45 2.5G (2.5G Ethernet)',
    'RJ45 5G': 'RJ45 5G (5G Ethernet)',
    'RJ45 10G': 'RJ45 10G (10G Ethernet)',
    'GBIC': 'GBIC (1G, устар.)',
    'SFP': 'SFP (mini-GBIC, 1G)',
    'SFP+': 'SFP+ (10G)',
    'SFP28': 'SFP28 (25G)',
    'SFP56': 'SFP56 (50G)',
    'XFP': 'XFP (10G)',
    'X2': 'X2 (10G, устар.)',
    'XENPAK': 'XENPAK (10G, устар.)',
    'CFP': 'CFP (40G)',
    'CFP2': 'CFP2 (100G)',
    'CFP4': 'CFP4 (100G)',
    'QSFP+': 'QSFP+ (40G)',
    'QSFP': 'QSFP+ (40G)',
    'QSFP28': 'QSFP28 (100G)',
    'QSFP56': 'QSFP56 (50G/200G)',
    'QSFP56 (200G)': 'QSFP56 (50G/200G)',
    'QSFP-DD': 'QSFP-DD (400G/800G)',
    'QSFP-DD (400G)': 'QSFP-DD (400G/800G)',
    'OSFP': 'OSFP (400G/800G)',
    'FC': 'FC (Fibre Channel, 2–128G)',
    'FC (Fibre Channel)': 'FC (Fibre Channel, 2–128G)'
};
/** cableModelFiberSettings[manufacturer][model] = { fiberCount, fiberPalette }. */
var cableModelFiberSettings = {};

var LAY_CABLE_MFR_KEY = 'networkMap_layCableManufacturer';
var LAY_CABLE_MODEL_KEY = 'networkMap_layCableModel';

var DEVICE_CATALOG_PALETTE_BTN_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';

function getDeviceCatalogPaletteBtnHtml(extraClass, attrs) {
    extraClass = extraClass || '';
    attrs = attrs || '';
    return '<button type="button" class="device-catalog-cable-palette-btn' + extraClass + '" ' + attrs + '>' +
        DEVICE_CATALOG_PALETTE_BTN_ICON +
        '<span class="device-catalog-cable-palette-btn__label">Цвета</span></button>';
}

window.deviceCatalogActiveTab = 'switch';

var DEVICE_CATALOG_TAB_META = {
    switch: {
        label: 'Коммутаторы',
        desc: 'Коммутаторы в узле на карте: производитель и модель при редактировании узла и при добавлении коммутатора. Для модели можно задать число портов и тип каждого порта — они подставятся при добавлении коммутатора в узел.'
    },
    olt: {
        label: 'OLT',
        desc: 'Оптические линейные терминалы на карте: производитель и модель при создании и редактировании OLT. Для модели можно задать число PON-портов и тип каждого — они подставятся на карте.'
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
    },
    radioBridge: {
        label: 'Радиомосты',
        desc: 'Wi‑Fi радиомосты на карте (P2P и P2MP): производитель и модель при добавлении и в карточке объекта.'
    },
    sleeve: {
        label: 'Муфты',
        desc: 'Типы кабельных муфт для списка при добавлении и редактировании. Лишние типы (включая встроенные) можно убрать кнопкой «Удалить»; свои — добавляются кнопкой «Добавить».'
    },
    cross: {
        label: 'Кроссы',
        desc: 'Типы оптических кроссов для списка при добавлении и редактировании. Для каждого типа задаётся число портов по умолчанию.'
    },
    spliceCassette: {
        label: 'Сплайс-кассеты',
        desc: 'Типы сплайс-кассет для ящиков и кроссовых стоек: ёмкость по волокнам, подпись в списке при создании в ящике.'
    },
    cabinet: {
        label: 'Ящики',
        desc: 'Шкафы, боксы и контейнеры на карте: производитель и модель при создании и в карточке ящика (для документации и учёта).'
    },
    cable: {
        label: 'Кабели',
        desc: 'Марки и модели оптического кабеля. Для каждой модели можно задать число жил и цвета — они подставятся при прокладке и в карточке кабеля.'
    }
};

var DEVICE_CATALOG_TAB_TONE = {
    switch: '#8b5cf6',
    olt: '#0ea5e9',
    onu: '#06b6d4',
    camera: '#64748b',
    node: '#14b8a6',
    radioBridge: '#06b6d4',
    sleeve: '#22c55e',
    cross: '#a855f7',
    spliceCassette: '#f59e0b',
    cabinet: '#64748b',
    cable: '#f59e0b'
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

var DEVICE_CATALOG_ALLOWED_TABS = { node: 1, olt: 1, onu: 1, camera: 1, radioBridge: 1, switch: 1, sleeve: 1, cross: 1, spliceCassette: 1, cabinet: 1, cable: 1 };

function getDeviceCatalogStats(kind) {
    if (kind === 'sleeve' || kind === 'cross' || kind === 'spliceCassette') {
        var visible = kind === 'sleeve' ? getAllSleeveTypes() : (kind === 'cross' ? getAllCrossTypes() : getAllSpliceCassetteTypes());
        var builtinVisible = 0;
        var customVisible = 0;
        visible.forEach(function(t) {
            if (t.builtin) builtinVisible++;
            else customVisible++;
        });
        return {
            manufacturers: builtinVisible,
            models: customVisible
        };
    }
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
        if (tab === 'sleeve' || tab === 'cross' || tab === 'spliceCassette') {
            tabStatsEl.textContent = stats.manufacturers + ' / ' + stats.models;
            tabStatsEl.title = stats.manufacturers + ' встроенных типов, ' + stats.models + ' добавленных вами';
        } else {
            tabStatsEl.textContent = stats.manufacturers + ' / ' + stats.models;
            tabStatsEl.title = stats.manufacturers + ' производителей, ' + stats.models + ' моделей в разделе';
        }
    }

    var searchInp = document.getElementById('deviceCatalogSearch');
    if (searchInp) {
        searchInp.placeholder = (tab === 'sleeve' || tab === 'cross' || tab === 'spliceCassette')
            ? (tab === 'cross' ? 'Поиск типа кросса…' : (tab === 'spliceCassette' ? 'Поиск типа сплайс-кассеты…' : 'Поиск типа муфты…'))
            : 'Поиск производителя или модели…';
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
        badge.title = (k === 'sleeve' || k === 'cross' || k === 'spliceCassette')
            ? (s.manufacturers + ' встроенных, ' + s.models + ' своих')
            : (s.manufacturers + ' производителей, ' + s.models + ' моделей');
    });
}

function applyDeviceCatalogSearchFilter() {
    var q = getDeviceCatalogSearchQuery();
    var list = document.getElementById('deviceCatalogList');
    if (!list) return;
    var cards = list.querySelectorAll('.device-catalog-mfr, .device-catalog-sleeve-row, .device-catalog-cross-row, [data-cassette-id]');
    var visible = 0;
    cards.forEach(function(card) {
        var mfr = card.getAttribute('data-mfr') || card.getAttribute('data-sleeve-id') || card.getAttribute('data-cross-id') || card.getAttribute('data-cassette-id') || '';
        var models = [];
        card.querySelectorAll('.device-catalog-model-name').forEach(function(el) {
            models.push(el.textContent);
        });
        var labelEl = card.querySelector('.device-catalog-sleeve-label');
        if (labelEl) models.push(labelEl.textContent);
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
    if (kind === 'radioBridge') return radioBridgeDeviceCatalog;
    if (kind === 'cabinet') return cabinetDeviceCatalog;
    if (kind === 'switch') return switchDeviceCatalog;
    if (kind === 'cable') return cableDeviceCatalog;
    if (kind === 'general') return nodeDeviceCatalog;
    return nodeDeviceCatalog;
}

function getCatalogDefault(kind) {
    if (kind === 'node' || kind === 'general') return NODE_CATALOG_DEFAULT;
    if (kind === 'olt') return OLT_CATALOG_DEFAULT;
    if (kind === 'onu') return ONU_CATALOG_DEFAULT;
    if (kind === 'camera') return CAMERA_CATALOG_DEFAULT;
    if (kind === 'radioBridge') return RADIO_BRIDGE_CATALOG_DEFAULT;
    if (kind === 'cabinet') return CABINET_CATALOG_DEFAULT;
    if (kind === 'switch') return SWITCH_CATALOG_DEFAULT;
    if (kind === 'cable') return CABLE_CATALOG_DEFAULT;
    return NODE_CATALOG_DEFAULT;
}

function resetDeviceCatalogTabToDefault(kind) {
    if (!DEVICE_CATALOG_ALLOWED_TABS[kind]) return;
    var def = getCatalogDefault(kind);
    if (kind === 'node') nodeDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'olt') oltDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'onu') onuDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'camera') cameraDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'radioBridge') {
        radioBridgeDeviceCatalog = cloneDeepCatalog(def);
        radioBridgeModelDefaultPorts = {};
    }
    else if (kind === 'cabinet') cabinetDeviceCatalog = cloneDeepCatalog(def);
    else if (kind === 'switch') {
        switchDeviceCatalog = cloneDeepCatalog(def);
        switchModelDefaultPorts = {};
        switchModelPortTypes = {};
    } else if (kind === 'olt') {
        oltDeviceCatalog = cloneDeepCatalog(def);
        oltModelDefaultPorts = {};
        oltModelPortTypes = {};
    } else if (kind === 'cable') {
        cableDeviceCatalog = cloneDeepCatalog(def);
        cableModelFiberSettings = {};
    } else if (kind === 'sleeve') {
        resetSleeveCatalogToDefault();
        refreshAllSleeveTypeSelects();
        return;
    } else if (kind === 'cross') {
        resetCrossCatalogToDefault();
        refreshAllCrossTypeSelects();
        return;
    } else if (kind === 'spliceCassette') {
        resetSpliceCassetteCatalogToDefault();
        refreshAllSpliceCassetteTypeSelects();
        return;
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
    if (kind === 'radioBridge' && radioBridgeModelDefaultPorts[name]) {
        delete radioBridgeModelDefaultPorts[name];
    }
    if (kind === 'switch' && switchModelPortTypes[name]) {
        delete switchModelPortTypes[name];
    }
    if (kind === 'olt' && oltModelDefaultPorts[name]) {
        delete oltModelDefaultPorts[name];
    }
    if (kind === 'olt' && oltModelPortTypes[name]) {
        delete oltModelPortTypes[name];
    }
    if (kind === 'cable' && cableModelFiberSettings[name]) {
        delete cableModelFiberSettings[name];
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
    if (kind === 'switch' && switchModelPortTypes[manufacturer]) {
        if (switchModelPortTypes[manufacturer][model] !== undefined) {
            delete switchModelPortTypes[manufacturer][model];
        }
        if (Object.keys(switchModelPortTypes[manufacturer]).length === 0) {
            delete switchModelPortTypes[manufacturer];
        }
    }
    if (kind === 'radioBridge' && radioBridgeModelDefaultPorts[manufacturer]) {
        if (radioBridgeModelDefaultPorts[manufacturer][model] !== undefined) {
            delete radioBridgeModelDefaultPorts[manufacturer][model];
        }
        if (Object.keys(radioBridgeModelDefaultPorts[manufacturer]).length === 0) {
            delete radioBridgeModelDefaultPorts[manufacturer];
        }
    }
    if (kind === 'olt' && oltModelDefaultPorts[manufacturer]) {
        if (oltModelDefaultPorts[manufacturer][model] !== undefined) {
            delete oltModelDefaultPorts[manufacturer][model];
        }
        if (Object.keys(oltModelDefaultPorts[manufacturer]).length === 0) {
            delete oltModelDefaultPorts[manufacturer];
        }
    }
    if (kind === 'olt' && oltModelPortTypes[manufacturer]) {
        if (oltModelPortTypes[manufacturer][model] !== undefined) {
            delete oltModelPortTypes[manufacturer][model];
        }
        if (Object.keys(oltModelPortTypes[manufacturer]).length === 0) {
            delete oltModelPortTypes[manufacturer];
        }
    }
    if (kind === 'cable' && cableModelFiberSettings[manufacturer]) {
        if (cableModelFiberSettings[manufacturer][model] !== undefined) {
            delete cableModelFiberSettings[manufacturer][model];
        }
        if (Object.keys(cableModelFiberSettings[manufacturer]).length === 0) {
            delete cableModelFiberSettings[manufacturer];
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

function getDeviceManufacturers() {
    return getManufacturersForCatalog('node');
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

function getRadioBridgeModelDefaultPortCount(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return null;
    var byM = radioBridgeModelDefaultPorts[mfr];
    if (!byM || typeof byM !== 'object') return null;
    var n = parseInt(byM[mod], 10);
    if (isNaN(n) || n < 1) return null;
    return Math.min(8, n);
}

function setRadioBridgeModelDefaultPortCount(manufacturer, model, portCount) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (portCount === null || portCount === undefined || portCount === '') {
        if (radioBridgeModelDefaultPorts[mfr] && radioBridgeModelDefaultPorts[mfr][mod] !== undefined) {
            delete radioBridgeModelDefaultPorts[mfr][mod];
            if (Object.keys(radioBridgeModelDefaultPorts[mfr]).length === 0) delete radioBridgeModelDefaultPorts[mfr];
        }
        saveDeviceCatalog();
        return true;
    }
    var n = parseInt(portCount, 10);
    if (isNaN(n) || n < 1) {
        if (radioBridgeModelDefaultPorts[mfr] && radioBridgeModelDefaultPorts[mfr][mod] !== undefined) {
            delete radioBridgeModelDefaultPorts[mfr][mod];
            if (Object.keys(radioBridgeModelDefaultPorts[mfr]).length === 0) delete radioBridgeModelDefaultPorts[mfr];
        }
        saveDeviceCatalog();
        return true;
    }
    n = Math.min(8, Math.max(1, n));
    if (!radioBridgeModelDefaultPorts[mfr]) radioBridgeModelDefaultPorts[mfr] = {};
    radioBridgeModelDefaultPorts[mfr][mod] = n;
    saveDeviceCatalog();
    return true;
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
    var customTypes = getSwitchModelPortTypes(mfr, mod);
    if (customTypes && customTypes.length) {
        var padKind = customTypes[customTypes.length - 1] || SWITCH_PORT_DEFAULT_KIND;
        setSwitchModelPortTypes(mfr, mod, normalizeSwitchPortTypesList(n, customTypes, padKind), true);
    }
    saveDeviceCatalog();
    return true;
}

function getSwitchPortDefaultKind() {
    return SWITCH_PORT_DEFAULT_KIND;
}

function getSwitchPortKindOptions() {
    return SWITCH_PORT_KIND_OPTIONS.slice();
}

function canonicalizeSwitchPortKindLabel(label) {
    var L = String(label || '').trim();
    if (!L) return SWITCH_PORT_DEFAULT_KIND;
    if (SWITCH_PORT_KIND_OPTIONS.indexOf(L) !== -1) return L;
    if (SWITCH_PORT_LEGACY_LABELS[L]) return SWITCH_PORT_LEGACY_LABELS[L];
    return L;
}

function isSwitchPortComboType(portTypeLabel) {
    if (!portTypeLabel || typeof portTypeLabel !== 'string') return false;
    return portTypeLabel.trim().indexOf('Комбо') === 0;
}

/** Медный кабель: RJ45 и комбо RJ45/SFP (в один момент — либо медь, либо оптика). */
function isSwitchPortCopperCapable(portTypeLabel) {
    if (!portTypeLabel || typeof portTypeLabel !== 'string') return false;
    var L = portTypeLabel.trim();
    if (!L || L === 'Консоль' || L === 'Uplink/stack') return false;
    if (L.indexOf('Комбо') === 0) return true;
    if (L.indexOf('RJ45') === 0) return true;
    return false;
}

function isSwitchPortOpticalFiberType(portTypeLabel) {
    if (!portTypeLabel || typeof portTypeLabel !== 'string') return false;
    var L = portTypeLabel.trim();
    if (!L || L === 'Консоль' || L === 'Uplink/stack') return false;
    if (L.indexOf('Комбо') === 0) return true;
    if (L.indexOf('RJ45') === 0) return false;
    if (L.indexOf('GBIC') === 0) return true;
    if (L.indexOf('SFP') === 0) return true;
    if (L.indexOf('XFP') === 0) return true;
    if (L.indexOf('X2') === 0) return true;
    if (L.indexOf('XENPAK') === 0) return true;
    if (L.indexOf('CFP') === 0) return true;
    if (L.indexOf('QSFP') === 0) return true;
    if (L.indexOf('OSFP') === 0) return true;
    if (L.indexOf('FC') === 0 || L.indexOf('Fibre Channel') !== -1) return true;
    return false;
}

function normalizeSwitchPortTypesList(count, types, defaultKind) {
    var n = Math.min(96, Math.max(1, parseInt(count, 10) || 1));
    var dk = canonicalizeSwitchPortKindLabel(defaultKind || SWITCH_PORT_DEFAULT_KIND);
    var src = Array.isArray(types) ? types : [];
    var out = [];
    for (var i = 0; i < n; i++) out.push(canonicalizeSwitchPortKindLabel(src[i] || dk));
    return out;
}

function getSwitchModelPortTypes(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return null;
    var byM = switchModelPortTypes[mfr];
    if (!byM || typeof byM !== 'object') return null;
    var arr = byM[mod];
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(function(t) { return String(t || SWITCH_PORT_DEFAULT_KIND); });
}

function switchModelHasCustomPortTypes(manufacturer, model) {
    var types = getSwitchModelPortTypes(manufacturer, model);
    return !!(types && types.length);
}

function setSwitchModelPortTypes(manufacturer, model, types, skipSave) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (!types || !types.length) {
        if (switchModelPortTypes[mfr] && switchModelPortTypes[mfr][mod] !== undefined) {
            delete switchModelPortTypes[mfr][mod];
            if (Object.keys(switchModelPortTypes[mfr]).length === 0) delete switchModelPortTypes[mfr];
        }
        if (!skipSave) saveDeviceCatalog();
        return true;
    }
    var normalized = normalizeSwitchPortTypesList(types.length, types, types[types.length - 1] || SWITCH_PORT_DEFAULT_KIND);
    if (!switchModelPortTypes[mfr]) switchModelPortTypes[mfr] = {};
    switchModelPortTypes[mfr][mod] = normalized;
    if (!switchModelDefaultPorts[mfr]) switchModelDefaultPorts[mfr] = {};
    switchModelDefaultPorts[mfr][mod] = normalized.length;
    if (!skipSave) saveDeviceCatalog();
    return true;
}

function resolveSwitchPortTypesForModel(manufacturer, model, portCount, defaultKind) {
    var custom = getSwitchModelPortTypes(manufacturer, model);
    if (custom && custom.length) return custom.slice();
    var n = parseInt(portCount, 10);
    if (isNaN(n) || n < 1) {
        var defN = getSwitchModelDefaultPortCount(manufacturer, model);
        n = defN != null ? defN : 24;
    }
    n = Math.min(96, Math.max(1, n));
    var dk = defaultKind || SWITCH_PORT_DEFAULT_KIND;
    return typeof buildSwitchPortTypesArray === 'function'
        ? buildSwitchPortTypesArray(n, dk)
        : normalizeSwitchPortTypesList(n, [], dk);
}

function getOltCatalogPonDefaultKind() {
    return typeof getPonPortDefaultKind === 'function' ? getPonPortDefaultKind() : 'GPON';
}

function getOltCatalogPonKindOptions() {
    return typeof getPonPortKindOptions === 'function' ? getPonPortKindOptions() : ['GPON', 'XGS-PON', 'EPON'];
}

function normalizeOltPortTypesList(count, types, defaultKind) {
    var n = Math.min(96, Math.max(1, parseInt(count, 10) || 1));
    var dk = String(defaultKind || getOltCatalogPonDefaultKind()).trim() || 'GPON';
    var src = Array.isArray(types) ? types : [];
    var out = [];
    for (var i = 0; i < n; i++) out.push(String(src[i] || dk).trim() || dk);
    return out;
}

function inferOltModelPortCount(model) {
    if (!model) return null;
    var m = String(model).trim().match(/[-–_/](\d{1,2})$/);
    if (!m) return null;
    return normalizeOltPortTypesList(m[1], [], getOltCatalogPonDefaultKind()).length;
}

function getOltModelDefaultPortCount(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return null;
    var byM = oltModelDefaultPorts[mfr];
    if (byM && typeof byM === 'object') {
        var n = parseInt(byM[mod], 10);
        if (!isNaN(n) && n >= 1) return Math.min(96, n);
    }
    var custom = getOltModelPortTypes(mfr, mod);
    if (custom && custom.length) return custom.length;
    return inferOltModelPortCount(mod);
}

function setOltModelDefaultPortCount(manufacturer, model, portCount) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (portCount === null || portCount === undefined || portCount === '') {
        if (oltModelDefaultPorts[mfr] && oltModelDefaultPorts[mfr][mod] !== undefined) {
            delete oltModelDefaultPorts[mfr][mod];
            if (Object.keys(oltModelDefaultPorts[mfr]).length === 0) delete oltModelDefaultPorts[mfr];
        }
        saveDeviceCatalog();
        return true;
    }
    var n = parseInt(portCount, 10);
    if (isNaN(n) || n < 1) {
        if (oltModelDefaultPorts[mfr] && oltModelDefaultPorts[mfr][mod] !== undefined) {
            delete oltModelDefaultPorts[mfr][mod];
            if (Object.keys(oltModelDefaultPorts[mfr]).length === 0) delete oltModelDefaultPorts[mfr];
        }
        saveDeviceCatalog();
        return true;
    }
    n = Math.min(96, Math.max(1, n));
    if (!oltModelDefaultPorts[mfr]) oltModelDefaultPorts[mfr] = {};
    oltModelDefaultPorts[mfr][mod] = n;
    var customTypes = getOltModelPortTypes(mfr, mod);
    if (customTypes && customTypes.length) {
        var padKind = customTypes[customTypes.length - 1] || getOltCatalogPonDefaultKind();
        setOltModelPortTypes(mfr, mod, normalizeOltPortTypesList(n, customTypes, padKind), true);
    }
    saveDeviceCatalog();
    return true;
}

function getOltModelPortTypes(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return null;
    var byM = oltModelPortTypes[mfr];
    if (!byM || typeof byM !== 'object') return null;
    var arr = byM[mod];
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(function(t) { return String(t || getOltCatalogPonDefaultKind()); });
}

function oltModelHasCustomPortTypes(manufacturer, model) {
    var types = getOltModelPortTypes(manufacturer, model);
    return !!(types && types.length);
}

function setOltModelPortTypes(manufacturer, model, types, skipSave) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (!types || !types.length) {
        if (oltModelPortTypes[mfr] && oltModelPortTypes[mfr][mod] !== undefined) {
            delete oltModelPortTypes[mfr][mod];
            if (Object.keys(oltModelPortTypes[mfr]).length === 0) delete oltModelPortTypes[mfr];
        }
        if (!skipSave) saveDeviceCatalog();
        return true;
    }
    var normalized = normalizeOltPortTypesList(types.length, types, types[types.length - 1] || getOltCatalogPonDefaultKind());
    if (!oltModelPortTypes[mfr]) oltModelPortTypes[mfr] = {};
    oltModelPortTypes[mfr][mod] = normalized;
    if (!oltModelDefaultPorts[mfr]) oltModelDefaultPorts[mfr] = {};
    oltModelDefaultPorts[mfr][mod] = normalized.length;
    if (!skipSave) saveDeviceCatalog();
    return true;
}

function resolveOltPortTypesForModel(manufacturer, model, portCount, defaultKind) {
    var custom = getOltModelPortTypes(manufacturer, model);
    if (custom && custom.length) return custom.slice();
    var n = parseInt(portCount, 10);
    if (isNaN(n) || n < 1) {
        var defN = getOltModelDefaultPortCount(manufacturer, model);
        n = defN != null ? defN : 8;
    }
    n = Math.min(96, Math.max(1, n));
    var dk = defaultKind || getOltCatalogPonDefaultKind();
    return normalizeOltPortTypesList(n, [], dk);
}

function normalizeCableModelFiberCount(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 1) return null;
    return Math.min(96, Math.max(1, v));
}

function inferCableModelFiberCount(model) {
    if (!model) return null;
    var m = String(model).trim().match(/[-–/](\d{1,2})$/);
    if (!m) return null;
    return normalizeCableModelFiberCount(m[1]);
}

function getCableModelFiberSettingsRef(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return null;
    var byM = cableModelFiberSettings[mfr];
    if (!byM || typeof byM !== 'object') return null;
    return byM[mod] || null;
}

function getCableModelFiberSettings(manufacturer, model) {
    var entry = getCableModelFiberSettingsRef(manufacturer, model);
    if (!entry || typeof entry !== 'object') return null;
    var fc = entry.fiberCount != null && entry.fiberCount !== ''
        ? normalizeCableModelFiberCount(entry.fiberCount)
        : null;
    var pal = Array.isArray(entry.fiberPalette) && entry.fiberPalette.length
        ? entry.fiberPalette.slice()
        : null;
    if (!fc && !pal) return null;
    return { fiberCount: fc, fiberPalette: pal };
}

function cleanupCableModelFiberEntry(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod || !cableModelFiberSettings[mfr] || !cableModelFiberSettings[mfr][mod]) return;
    var entry = cableModelFiberSettings[mfr][mod];
    var hasCount = entry.fiberCount != null && entry.fiberCount !== '' && normalizeCableModelFiberCount(entry.fiberCount) != null;
    var hasPal = Array.isArray(entry.fiberPalette) && entry.fiberPalette.length > 0;
    if (!hasCount && !hasPal) {
        delete cableModelFiberSettings[mfr][mod];
        if (Object.keys(cableModelFiberSettings[mfr]).length === 0) delete cableModelFiberSettings[mfr];
    }
}

function ensureCableModelFiberEntry(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!cableModelFiberSettings[mfr]) cableModelFiberSettings[mfr] = {};
    if (!cableModelFiberSettings[mfr][mod]) {
        cableModelFiberSettings[mfr][mod] = { fiberCount: null, fiberPalette: null };
    }
    return cableModelFiberSettings[mfr][mod];
}

function setCableModelFiberCount(manufacturer, model, fiberCount) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (fiberCount === null || fiberCount === undefined || fiberCount === '') {
        if (cableModelFiberSettings[mfr] && cableModelFiberSettings[mfr][mod]) {
            cableModelFiberSettings[mfr][mod].fiberCount = null;
            cleanupCableModelFiberEntry(mfr, mod);
        }
        saveDeviceCatalog();
        return true;
    }
    var n = normalizeCableModelFiberCount(fiberCount);
    if (n === null) {
        if (cableModelFiberSettings[mfr] && cableModelFiberSettings[mfr][mod]) {
            cableModelFiberSettings[mfr][mod].fiberCount = null;
            cleanupCableModelFiberEntry(mfr, mod);
        }
        saveDeviceCatalog();
        return true;
    }
    var entry = ensureCableModelFiberEntry(mfr, mod);
    entry.fiberCount = n;
    if (Array.isArray(entry.fiberPalette) && entry.fiberPalette.length && window.FiberCableConfig && window.FiberCableConfig.trimPaletteToCount) {
        entry.fiberPalette = window.FiberCableConfig.trimPaletteToCount(entry.fiberPalette, n);
    }
    saveDeviceCatalog();
    return true;
}

function setCableModelFiberPalette(manufacturer, model, fiberPalette) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return false;
    if (!fiberPalette || !fiberPalette.length) {
        if (cableModelFiberSettings[mfr] && cableModelFiberSettings[mfr][mod]) {
            cableModelFiberSettings[mfr][mod].fiberPalette = null;
            cleanupCableModelFiberEntry(mfr, mod);
        }
        saveDeviceCatalog();
        return true;
    }
    var entry = ensureCableModelFiberEntry(mfr, mod);
    var fc = entry.fiberCount != null && entry.fiberCount !== ''
        ? normalizeCableModelFiberCount(entry.fiberCount)
        : null;
    if (!fc) fc = normalizeCableModelFiberCount(fiberPalette.length) || 4;
    entry.fiberCount = fc;
    entry.fiberPalette = window.FiberCableConfig && window.FiberCableConfig.trimPaletteToCount
        ? window.FiberCableConfig.trimPaletteToCount(fiberPalette, fc)
        : fiberPalette.slice();
    saveDeviceCatalog();
    return true;
}

function cableModelHasCustomPalette(manufacturer, model) {
    var entry = getCableModelFiberSettingsRef(manufacturer, model);
    return !!(entry && Array.isArray(entry.fiberPalette) && entry.fiberPalette.length);
}

function getEffectiveCableModelFiberSettings(manufacturer, model) {
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mod) return null;
    var settings = getCableModelFiberSettings(mfr, mod);
    if (settings) {
        if (!settings.fiberCount && settings.fiberPalette && settings.fiberPalette.length) {
            settings.fiberCount = normalizeCableModelFiberCount(settings.fiberPalette.length);
        }
        if (settings.fiberCount || (settings.fiberPalette && settings.fiberPalette.length)) {
            return settings;
        }
    }
    var inferred = inferCableModelFiberCount(mod);
    if (inferred) return { fiberCount: inferred, fiberPalette: null };
    return null;
}

function applyCableModelSettingsToLayPanel(manufacturer, model) {
    if (!window.FiberCableConfig) return;
    var settings = getEffectiveCableModelFiberSettings(manufacturer, model);
    if (!settings) return;
    if (settings.fiberCount) {
        window.FiberCableConfig.setLayFiberCount(settings.fiberCount);
    }
    if (settings.fiberPalette && settings.fiberPalette.length) {
        window.FiberCableConfig.setLayFiberPalette(settings.fiberPalette);
    } else {
        window.FiberCableConfig.setLayFiberPalette(null);
    }
    if (window.FiberCableConfig.syncLayPaletteButtonState) {
        window.FiberCableConfig.syncLayPaletteButtonState();
    }
}

function getEffectiveLayCableFiberSettings() {
    return getEffectiveCableModelFiberSettings(getLayCableManufacturer(), getLayCableModel());
}

var _switchEntryPendingPortTypes = null;
var _oltEntryPendingPortTypes = null;
var _switchPortsEditorCtx = null;

function getCatalogPortDefaultKind(catalogKind) {
    return catalogKind === 'olt' ? getOltCatalogPonDefaultKind() : SWITCH_PORT_DEFAULT_KIND;
}

function buildCatalogPortKindSelectHtml(catalogKind, selected, extraClass, dataAttrs) {
    extraClass = extraClass || '';
    dataAttrs = dataAttrs || '';
    if (catalogKind === 'olt') {
        var selO = String(selected || getOltCatalogPonDefaultKind()).trim();
        var optsO = getOltCatalogPonKindOptions();
        if (selO && optsO.indexOf(selO) === -1) optsO = [selO].concat(optsO);
        var htmlO = '<select class="form-select form-select-compact switch-port-kind-select' + extraClass + '" ' + dataAttrs + '>';
        optsO.forEach(function(ko) {
            htmlO += '<option value="' + escapeHtml(ko) + '"' + (ko === selO ? ' selected' : '') + '>' + escapeHtml(ko) + '</option>';
        });
        htmlO += '</select>';
        return htmlO;
    }
    return buildSwitchPortKindSelectHtml(selected, extraClass, dataAttrs);
}

function renderSwitchModelPortsTableBody(tbody, types, catalogKind) {
    if (!tbody) return;
    catalogKind = catalogKind || (_switchPortsEditorCtx && _switchPortsEditorCtx.catalogKind) || 'switch';
    var html = '';
    (types || []).forEach(function(kind, idx) {
        var defKind = getCatalogPortDefaultKind(catalogKind);
        html += '<tr><td class="switch-ports-modal-num">' + (idx + 1) + '</td><td>';
        html += buildCatalogPortKindSelectHtml(catalogKind, kind || defKind, '', 'data-port-idx="' + idx + '"');
        html += '</td></tr>';
    });
    tbody.innerHTML = html;
}

function buildSwitchPortKindSelectHtml(selected, extraClass, dataAttrs) {
    extraClass = extraClass || '';
    dataAttrs = dataAttrs || '';
    var sel = String(selected || SWITCH_PORT_DEFAULT_KIND).trim();
    var canon = canonicalizeSwitchPortKindLabel(sel);
    var options = SWITCH_PORT_KIND_OPTIONS.slice();
    if (sel && options.indexOf(sel) === -1 && options.indexOf(canon) === -1) {
        options.unshift(sel);
    }
    var html = '<select class="form-select form-select-compact switch-port-kind-select' + extraClass + '" ' + dataAttrs + '>';
    options.forEach(function(ko) {
        var isSel = ko === sel || ko === canon;
        html += '<option value="' + escapeHtml(ko) + '"' + (isSel ? ' selected' : '') + '>' + escapeHtml(ko) + '</option>';
    });
    html += '</select>';
    return html;
}

function readSwitchModelPortsFromTable(tbody) {
    if (!tbody) return [];
    var rows = tbody.querySelectorAll('tr');
    var out = [];
    var catalogKind = (_switchPortsEditorCtx && _switchPortsEditorCtx.catalogKind) || 'switch';
    var defKind = getCatalogPortDefaultKind(catalogKind);
    rows.forEach(function(row) {
        var sel = row.querySelector('.switch-port-kind-select');
        out.push(sel ? (sel.value || defKind) : defKind);
    });
    return out;
}

function syncCatalogEntryPortsBtnState() {
    var btn = document.getElementById('deviceCatalogEntrySwitchPortsBtn');
    if (!btn) return;
    var tab = typeof getActiveDeviceCatalogTab === 'function' ? getActiveDeviceCatalogTab() : 'switch';
    var pending = tab === 'olt' ? _oltEntryPendingPortTypes : _switchEntryPendingPortTypes;
    btn.classList.toggle('device-catalog-switch-ports-btn--custom', !!(pending && pending.length));
}

function syncSwitchEntryPortsBtnState() {
    syncCatalogEntryPortsBtnState();
}

function openSwitchModelPortsEditor(manufacturer, model, opts) {
    opts = opts || {};
    var catalogKind = opts.catalogKind || (opts.entryMode && typeof getActiveDeviceCatalogTab === 'function' ? getActiveDeviceCatalogTab() : 'switch');
    if (catalogKind !== 'olt') catalogKind = 'switch';
    var isOlt = catalogKind === 'olt';
    var modal = document.getElementById('switchModelPortsModal');
    if (!modal) return;
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    var isEntry = !!opts.entryMode;
    var defPorts = isOlt ? 8 : 24;
    var defKind = getCatalogPortDefaultKind(catalogKind);
    if (isEntry) {
        var portsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
        var pv = portsInp ? parseInt(portsInp.value, 10) : NaN;
        defPorts = !isNaN(pv) && pv >= 1 ? Math.min(96, pv) : defPorts;
    } else if (isOlt) {
        var customO = getOltModelPortTypes(mfr, mod);
        var defNO = getOltModelDefaultPortCount(mfr, mod);
        defPorts = customO && customO.length ? customO.length : (defNO != null ? defNO : 8);
    } else {
        var custom = getSwitchModelPortTypes(mfr, mod);
        var defN = getSwitchModelDefaultPortCount(mfr, mod);
        defPorts = custom && custom.length ? custom.length : (defN != null ? defN : 24);
    }
    var types = isEntry
        ? (isOlt
            ? (_oltEntryPendingPortTypes ? _oltEntryPendingPortTypes.slice() : null)
            : (_switchEntryPendingPortTypes ? _switchEntryPendingPortTypes.slice() : null))
        : (isOlt ? getOltModelPortTypes(mfr, mod) : getSwitchModelPortTypes(mfr, mod));
    if (!types || !types.length) {
        types = isOlt
            ? normalizeOltPortTypesList(defPorts, [], defKind)
            : normalizeSwitchPortTypesList(defPorts, [], defKind);
    }
    _switchPortsEditorCtx = {
        manufacturer: mfr,
        model: mod,
        entryMode: isEntry,
        catalogKind: catalogKind
    };
    var titleEl = document.getElementById('switchModelPortsModalTitle');
    var hintEl = document.getElementById('switchModelPortsModalHint');
    var thType = document.getElementById('switchModelPortsTableTypeHeader');
    if (titleEl) {
        titleEl.textContent = isEntry
            ? (isOlt ? 'PON-порты новой модели' : 'Порты новой модели')
            : ((isOlt ? 'PON-порты — ' : 'Порты — ') + (mfr && mod ? mfr + ' ' + mod : (mod || mfr || (isOlt ? 'OLT' : 'коммутатор'))));
    }
    if (hintEl) {
        hintEl.textContent = isEntry
            ? 'Настройка сохранится вместе с новой моделью в справочнике.'
            : (isOlt
                ? 'Типы PON-портов подставятся при добавлении этой модели OLT на карту.'
                : 'Типы портов подставятся при добавлении этой модели коммутатора в узел на карте.');
    }
    if (thType) thType.textContent = isOlt ? 'Тип PON' : 'Тип порта';
    var countInp = document.getElementById('switchModelPortsCount');
    var tbody = document.getElementById('switchModelPortsTableBody');
    if (countInp) countInp.value = String(types.length);
    renderSwitchModelPortsTableBody(tbody, types, catalogKind);
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function() {
        if (typeof window.initPanelPlexusCanvases === 'function') window.initPanelPlexusCanvases(modal);
    });
}

function closeSwitchModelPortsModal() {
    var modal = document.getElementById('switchModelPortsModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    _switchPortsEditorCtx = null;
    var entryModal = document.getElementById('deviceCatalogEntryModal');
    var catalogModal = document.getElementById('deviceCatalogModal');
    if ((entryModal && entryModal.style.display === 'flex') || (catalogModal && catalogModal.style.display === 'flex')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

function saveSwitchModelPortsModal() {
    var ctx = _switchPortsEditorCtx;
    if (!ctx) return;
    var isOlt = ctx.catalogKind === 'olt';
    var defKind = getCatalogPortDefaultKind(ctx.catalogKind || 'switch');
    var tbody = document.getElementById('switchModelPortsTableBody');
    var types = readSwitchModelPortsFromTable(tbody);
    if (!types.length) {
        if (typeof showError === 'function') showError('Укажите хотя бы один порт', '');
        return;
    }
    if (ctx.entryMode) {
        if (isOlt) {
            _oltEntryPendingPortTypes = types.slice();
        } else {
            _switchEntryPendingPortTypes = types.slice();
        }
        var portsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
        if (portsInp) portsInp.value = String(types.length);
        syncCatalogEntryPortsBtnState();
        closeSwitchModelPortsModal();
        if (typeof showInfo === 'function') showInfo('Порты настроены', 'Сохраните модель в справочнике');
        return;
    }
    if (isOlt) {
        setOltModelPortTypes(ctx.manufacturer, ctx.model, types);
    } else {
        setSwitchModelPortTypes(ctx.manufacturer, ctx.model, types);
    }
    closeSwitchModelPortsModal();
    renderDeviceCatalogList();
    if (typeof showInfo === 'function') showInfo('Типы портов сохранены', '');
}

function setupSwitchModelPortsModalHandlers() {
    var modal = document.getElementById('switchModelPortsModal');
    if (!modal || modal._switchPortsModalBound) return;
    modal._switchPortsModalBound = true;

    var closeBtn = modal.querySelector('.close-switch-model-ports');
    if (closeBtn) closeBtn.addEventListener('click', closeSwitchModelPortsModal);

    var cancelBtn = document.getElementById('switchModelPortsCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeSwitchModelPortsModal);

    var saveBtn = document.getElementById('switchModelPortsSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveSwitchModelPortsModal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeSwitchModelPortsModal();
    });

    var countInp = document.getElementById('switchModelPortsCount');
    if (countInp) {
        countInp.addEventListener('change', function() {
            var n = parseInt(this.value, 10);
            if (isNaN(n) || n < 1) n = 1;
            n = Math.min(96, Math.max(1, n));
            this.value = String(n);
            var tbody = document.getElementById('switchModelPortsTableBody');
            var current = readSwitchModelPortsFromTable(tbody);
            var catalogKind = (_switchPortsEditorCtx && _switchPortsEditorCtx.catalogKind) || 'switch';
            var pad = current.length ? current[current.length - 1] : getCatalogPortDefaultKind(catalogKind);
            var normalized = catalogKind === 'olt'
                ? normalizeOltPortTypesList(n, current, pad)
                : normalizeSwitchPortTypesList(n, current, pad);
            renderSwitchModelPortsTableBody(tbody, normalized, catalogKind);
        });
    }

    var fillBtn = document.getElementById('switchModelPortsFillLikeFirstBtn');
    if (fillBtn) {
        fillBtn.addEventListener('click', function() {
            var tbody = document.getElementById('switchModelPortsTableBody');
            var current = readSwitchModelPortsFromTable(tbody);
            if (!current.length) return;
            var catalogKind = (_switchPortsEditorCtx && _switchPortsEditorCtx.catalogKind) || 'switch';
            var first = current[0] || getCatalogPortDefaultKind(catalogKind);
            renderSwitchModelPortsTableBody(tbody, current.map(function() { return first; }), catalogKind);
        });
    }
}

var _cableEntryPendingFiber = null;

function syncCableEntryPaletteBtnState() {
    var btn = document.getElementById('deviceCatalogEntryCablePaletteBtn');
    if (!btn) return;
    btn.classList.toggle('device-catalog-cable-palette-btn--custom', !!(_cableEntryPendingFiber && _cableEntryPendingFiber.palette && _cableEntryPendingFiber.palette.length));
}

function openCableCatalogEntryPaletteEditor() {
    if (!window.FiberCableConfig) return;
    var fibersInp = document.getElementById('deviceCatalogEntryCableFibers');
    var modelInp = document.getElementById('deviceCatalogEntryModelName');
    var fc = fibersInp && fibersInp.value ? parseInt(fibersInp.value, 10) : NaN;
    if (isNaN(fc) || fc < 1) {
        fc = inferCableModelFiberCount(modelInp ? modelInp.value : '') || 4;
    }
    var palette = _cableEntryPendingFiber && _cableEntryPendingFiber.palette && _cableEntryPendingFiber.palette.length
        ? _cableEntryPendingFiber.palette
        : null;
    window.FiberCableConfig.openFiberPaletteEditor({
        title: 'Цвета жил — новая модель кабеля',
        fiberCount: fc,
        palette: palette || window.FiberCableConfig.buildStandardPalette(fc),
        onSave: function(r) {
            _cableEntryPendingFiber = { fiberCount: r.fiberCount, palette: r.palette };
            if (fibersInp) fibersInp.value = String(r.fiberCount);
            syncCableEntryPaletteBtnState();
        }
    });
}

function openCableCatalogPaletteEditor(manufacturer, model, fiberCountOverride) {
    if (!window.FiberCableConfig) return;
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr || !mod) return;
    var settings = getCableModelFiberSettings(mfr, mod);
    var fc = fiberCountOverride != null && fiberCountOverride !== ''
        ? normalizeCableModelFiberCount(fiberCountOverride)
        : null;
    if (fc == null && settings && settings.fiberCount) fc = settings.fiberCount;
    if (fc == null) fc = inferCableModelFiberCount(mod) || 4;
    var palette = settings && settings.fiberPalette && settings.fiberPalette.length
        ? settings.fiberPalette
        : window.FiberCableConfig.buildStandardPalette(fc);
    window.FiberCableConfig.openFiberPaletteEditor({
        title: 'Цвета жил — ' + getCableProductLabel(mfr, mod),
        fiberCount: fc,
        palette: palette,
        onSave: function(r) {
            setCableModelFiberCount(mfr, mod, r.fiberCount);
            setCableModelFiberPalette(mfr, mod, r.palette);
            renderDeviceCatalogList();
            if (typeof showInfo === 'function') showInfo('Настройки жил сохранены', '');
        }
    });
}

var CUSTOM_DEVICE_OPTIONS_STORAGE_KEY = 'networkmap_customDeviceOptions';
/** Блокирует запись в localStorage и на сервер во время загрузки (иначе дефолты затирают данные организации). */
var _deviceCatalogHydrationDepth = 0;

function getDeviceCatalogStorageKey() {
    var orgId = (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null)
        ? String(currentUser.organizationId)
        : '';
    return orgId ? (CUSTOM_DEVICE_OPTIONS_STORAGE_KEY + '_' + orgId) : CUSTOM_DEVICE_OPTIONS_STORAGE_KEY;
}

function buildDeviceCatalogPayload() {
    return {
        nodeDeviceCatalog: cloneDeepCatalog(nodeDeviceCatalog),
        oltDeviceCatalog: cloneDeepCatalog(oltDeviceCatalog),
        onuDeviceCatalog: cloneDeepCatalog(onuDeviceCatalog),
        cameraDeviceCatalog: cloneDeepCatalog(cameraDeviceCatalog),
        radioBridgeDeviceCatalog: cloneDeepCatalog(radioBridgeDeviceCatalog),
        radioBridgeModelDefaultPorts: JSON.parse(JSON.stringify(radioBridgeModelDefaultPorts || {})),
        cabinetDeviceCatalog: cloneDeepCatalog(cabinetDeviceCatalog),
        switchDeviceCatalog: cloneDeepCatalog(switchDeviceCatalog),
        switchModelDefaultPorts: JSON.parse(JSON.stringify(switchModelDefaultPorts || {})),
        switchModelPortTypes: JSON.parse(JSON.stringify(switchModelPortTypes || {})),
        oltModelDefaultPorts: JSON.parse(JSON.stringify(oltModelDefaultPorts || {})),
        oltModelPortTypes: JSON.parse(JSON.stringify(oltModelPortTypes || {})),
        cableDeviceCatalog: cloneDeepCatalog(cableDeviceCatalog),
        cableModelFiberSettings: JSON.parse(JSON.stringify(cableModelFiberSettings || {})),
        customSleeveTypes: getCustomSleeveTypes(),
        hiddenBuiltinSleeveTypes: getHiddenBuiltinSleeveTypes(),
        customCrossTypes: getCustomCrossTypes(),
        hiddenBuiltinCrossTypes: getHiddenBuiltinCrossTypes(),
        customSpliceCassetteTypes: getCustomSpliceCassetteTypes(),
        hiddenBuiltinSpliceCassetteTypes: getHiddenBuiltinSpliceCassetteTypes()
    };
}

function syncDeviceCatalogLocalStorage() {
    try { localStorage.setItem(getDeviceCatalogStorageKey(), JSON.stringify(buildDeviceCatalogPayload())); } catch (e) {}
}

function withDeviceCatalogHydration(fn) {
    _deviceCatalogHydrationDepth++;
    try { return fn(); } finally { _deviceCatalogHydrationDepth--; }
}

function saveDeviceCatalog() {
    if (_deviceCatalogHydrationDepth > 0) return;
    var payload = buildDeviceCatalogPayload();
    try { localStorage.setItem(getDeviceCatalogStorageKey(), JSON.stringify(payload)); } catch (e) {}
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
        if ('radioBridgeDeviceCatalog' in opts && opts.radioBridgeDeviceCatalog && typeof opts.radioBridgeDeviceCatalog === 'object') {
            radioBridgeDeviceCatalog = cloneDeepCatalog(opts.radioBridgeDeviceCatalog);
        } else {
            radioBridgeDeviceCatalog = cloneDeepCatalog(RADIO_BRIDGE_CATALOG_DEFAULT);
        }
        if ('cabinetDeviceCatalog' in opts && opts.cabinetDeviceCatalog && typeof opts.cabinetDeviceCatalog === 'object') {
            cabinetDeviceCatalog = cloneDeepCatalog(opts.cabinetDeviceCatalog);
        } else {
            cabinetDeviceCatalog = cloneDeepCatalog(CABINET_CATALOG_DEFAULT);
        }
        if ('switchDeviceCatalog' in opts && opts.switchDeviceCatalog && typeof opts.switchDeviceCatalog === 'object') {
            switchDeviceCatalog = cloneDeepCatalog(opts.switchDeviceCatalog);
        } else {
            switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
        }
        if ('cableDeviceCatalog' in opts && opts.cableDeviceCatalog && typeof opts.cableDeviceCatalog === 'object') {
            cableDeviceCatalog = cloneDeepCatalog(opts.cableDeviceCatalog);
        } else {
            cableDeviceCatalog = cloneDeepCatalog(CABLE_CATALOG_DEFAULT);
        }
        if (opts.switchModelDefaultPorts && typeof opts.switchModelDefaultPorts === 'object') {
            switchModelDefaultPorts = JSON.parse(JSON.stringify(opts.switchModelDefaultPorts));
        } else {
            switchModelDefaultPorts = {};
        }
        if (opts.switchModelPortTypes && typeof opts.switchModelPortTypes === 'object') {
            switchModelPortTypes = JSON.parse(JSON.stringify(opts.switchModelPortTypes));
        } else {
            switchModelPortTypes = {};
        }
        if (opts.radioBridgeModelDefaultPorts && typeof opts.radioBridgeModelDefaultPorts === 'object') {
            radioBridgeModelDefaultPorts = JSON.parse(JSON.stringify(opts.radioBridgeModelDefaultPorts));
        } else {
            radioBridgeModelDefaultPorts = {};
        }
        if (opts.oltModelDefaultPorts && typeof opts.oltModelDefaultPorts === 'object') {
            oltModelDefaultPorts = JSON.parse(JSON.stringify(opts.oltModelDefaultPorts));
        } else {
            oltModelDefaultPorts = {};
        }
        if (opts.oltModelPortTypes && typeof opts.oltModelPortTypes === 'object') {
            oltModelPortTypes = JSON.parse(JSON.stringify(opts.oltModelPortTypes));
        } else {
            oltModelPortTypes = {};
        }
        if (opts.cableModelFiberSettings && typeof opts.cableModelFiberSettings === 'object') {
            cableModelFiberSettings = JSON.parse(JSON.stringify(opts.cableModelFiberSettings));
        } else {
            cableModelFiberSettings = {};
        }
        applyCustomSleeveTypesFromOpts(opts);
        applyCustomCrossTypesFromOpts(opts);
        saveDeviceCatalog();
        refreshAllSleeveTypeSelects();
        refreshAllCrossTypeSelects();
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

    if ('radioBridgeDeviceCatalog' in opts && opts.radioBridgeDeviceCatalog && typeof opts.radioBridgeDeviceCatalog === 'object') {
        radioBridgeDeviceCatalog = cloneDeepCatalog(opts.radioBridgeDeviceCatalog);
    } else if (!('radioBridgeDeviceCatalog' in opts)) {
        radioBridgeDeviceCatalog = cloneDeepCatalog(RADIO_BRIDGE_CATALOG_DEFAULT);
    }

    if ('cabinetDeviceCatalog' in opts && opts.cabinetDeviceCatalog && typeof opts.cabinetDeviceCatalog === 'object') {
        cabinetDeviceCatalog = cloneDeepCatalog(opts.cabinetDeviceCatalog);
    } else if (!('cabinetDeviceCatalog' in opts)) {
        cabinetDeviceCatalog = cloneDeepCatalog(CABINET_CATALOG_DEFAULT);
    }

    if ('switchDeviceCatalog' in opts && opts.switchDeviceCatalog && typeof opts.switchDeviceCatalog === 'object') {
        switchDeviceCatalog = cloneDeepCatalog(opts.switchDeviceCatalog);
    } else if (!('switchDeviceCatalog' in opts)) {
        switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
    }

    if ('cableDeviceCatalog' in opts && opts.cableDeviceCatalog && typeof opts.cableDeviceCatalog === 'object') {
        cableDeviceCatalog = cloneDeepCatalog(opts.cableDeviceCatalog);
    } else if (!('cableDeviceCatalog' in opts)) {
        cableDeviceCatalog = cloneDeepCatalog(CABLE_CATALOG_DEFAULT);
    }

    if (opts.switchModelDefaultPorts && typeof opts.switchModelDefaultPorts === 'object') {
        switchModelDefaultPorts = JSON.parse(JSON.stringify(opts.switchModelDefaultPorts));
    } else {
        switchModelDefaultPorts = {};
    }

    if (opts.switchModelPortTypes && typeof opts.switchModelPortTypes === 'object') {
        switchModelPortTypes = JSON.parse(JSON.stringify(opts.switchModelPortTypes));
    } else if (!('switchModelPortTypes' in opts)) {
        switchModelPortTypes = {};
    }

    if (opts.radioBridgeModelDefaultPorts && typeof opts.radioBridgeModelDefaultPorts === 'object') {
        radioBridgeModelDefaultPorts = JSON.parse(JSON.stringify(opts.radioBridgeModelDefaultPorts));
    } else if (!('radioBridgeModelDefaultPorts' in opts)) {
        radioBridgeModelDefaultPorts = {};
    }

    if (opts.oltModelDefaultPorts && typeof opts.oltModelDefaultPorts === 'object') {
        oltModelDefaultPorts = JSON.parse(JSON.stringify(opts.oltModelDefaultPorts));
    } else if (!('oltModelDefaultPorts' in opts)) {
        oltModelDefaultPorts = {};
    }

    if (opts.oltModelPortTypes && typeof opts.oltModelPortTypes === 'object') {
        oltModelPortTypes = JSON.parse(JSON.stringify(opts.oltModelPortTypes));
    } else if (!('oltModelPortTypes' in opts)) {
        oltModelPortTypes = {};
    }

    if (opts.cableModelFiberSettings && typeof opts.cableModelFiberSettings === 'object') {
        cableModelFiberSettings = JSON.parse(JSON.stringify(opts.cableModelFiberSettings));
    } else if (!('cableModelFiberSettings' in opts)) {
        cableModelFiberSettings = {};
    }

    applyCustomSleeveTypesFromOpts(opts);
    applyCustomCrossTypesFromOpts(opts);
    applyCustomSpliceCassetteTypesFromOpts(opts);

    if (mergeNodeCatalogIntoSwitch()) saveDeviceCatalog();
    refreshAllSleeveTypeSelects();
    refreshAllCrossTypeSelects();
    refreshAllSpliceCassetteTypeSelects();
}

function applyCustomSleeveTypesFromOpts(opts) {
    opts = opts || {};
    if ('customSleeveTypes' in opts) {
        if (!Array.isArray(opts.customSleeveTypes)) {
            customSleeveTypes = [];
        } else {
            customSleeveTypes = opts.customSleeveTypes.map(function(t) {
                if (!t || !t.id) return null;
                return {
                    id: normalizeSleeveTypeId(t.id),
                    label: (t.label || t.id || '').trim() || normalizeSleeveTypeId(t.id),
                    maxFibers: normalizeSleeveMaxFibers(t.maxFibers)
                };
            }).filter(Boolean);
        }
    }
    if ('hiddenBuiltinSleeveTypes' in opts) {
        if (!Array.isArray(opts.hiddenBuiltinSleeveTypes)) {
            hiddenBuiltinSleeveTypes = [];
        } else {
            hiddenBuiltinSleeveTypes = opts.hiddenBuiltinSleeveTypes.map(function(id) {
                return normalizeSleeveTypeId(id);
            }).filter(Boolean);
        }
    }
}

function applyCustomCrossTypesFromOpts(opts) {
    opts = opts || {};
    if ('customCrossTypes' in opts) {
        if (!Array.isArray(opts.customCrossTypes)) {
            customCrossTypes = [];
        } else {
            customCrossTypes = opts.customCrossTypes.map(function(t) {
                if (!t || !t.id) return null;
                return {
                    id: normalizeCrossTypeId(t.id),
                    label: (t.label || t.id || '').trim() || normalizeCrossTypeId(t.id),
                    defaultPorts: normalizeCrossDefaultPorts(t.defaultPorts)
                };
            }).filter(Boolean);
        }
    }
    if ('hiddenBuiltinCrossTypes' in opts) {
        if (!Array.isArray(opts.hiddenBuiltinCrossTypes)) {
            hiddenBuiltinCrossTypes = [];
        } else {
            hiddenBuiltinCrossTypes = opts.hiddenBuiltinCrossTypes.map(function(id) {
                return normalizeCrossTypeId(id);
            }).filter(Boolean);
        }
    }
}

function applyCustomSpliceCassetteTypesFromOpts(opts) {
    opts = opts || {};
    if ('customSpliceCassetteTypes' in opts) {
        if (!Array.isArray(opts.customSpliceCassetteTypes)) {
            customSpliceCassetteTypes = [];
        } else {
            customSpliceCassetteTypes = opts.customSpliceCassetteTypes.map(function(t) {
                if (!t || !t.id) return null;
                return {
                    id: normalizeSpliceCassetteTypeId(t.id),
                    label: (t.label || t.id || '').trim() || normalizeSpliceCassetteTypeId(t.id),
                    maxFibers: normalizeSpliceCassetteMaxFibers(t.maxFibers)
                };
            }).filter(Boolean);
        }
    }
    if ('hiddenBuiltinSpliceCassetteTypes' in opts) {
        if (!Array.isArray(opts.hiddenBuiltinSpliceCassetteTypes)) {
            hiddenBuiltinSpliceCassetteTypes = [];
        } else {
            hiddenBuiltinSpliceCassetteTypes = opts.hiddenBuiltinSpliceCassetteTypes.map(function(id) {
                return normalizeSpliceCassetteTypeId(id);
            }).filter(Boolean);
        }
    }
}

function loadCustomDeviceOptions(opts) {
    withDeviceCatalogHydration(function() { loadDeviceCatalog(opts || {}); });
}

function loadCustomDeviceOptionsFromStorage() {
    try {
        var raw = localStorage.getItem(getDeviceCatalogStorageKey());
        if (!raw && getDeviceCatalogStorageKey() !== CUSTOM_DEVICE_OPTIONS_STORAGE_KEY) {
            raw = localStorage.getItem(CUSTOM_DEVICE_OPTIONS_STORAGE_KEY);
        }
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') loadCustomDeviceOptions(parsed);
        else {
            refreshAllSleeveTypeSelects();
            refreshAllCrossTypeSelects();
            refreshAllSpliceCassetteTypeSelects();
        }
    } catch (e) {}
}

function ensureDeviceCatalogsNonEmpty() {
    if (Object.keys(nodeDeviceCatalog || {}).length === 0) nodeDeviceCatalog = cloneDeepCatalog(NODE_CATALOG_DEFAULT);
    if (Object.keys(oltDeviceCatalog || {}).length === 0) oltDeviceCatalog = cloneDeepCatalog(OLT_CATALOG_DEFAULT);
    if (Object.keys(onuDeviceCatalog || {}).length === 0) onuDeviceCatalog = cloneDeepCatalog(ONU_CATALOG_DEFAULT);
    if (Object.keys(cameraDeviceCatalog || {}).length === 0) cameraDeviceCatalog = cloneDeepCatalog(CAMERA_CATALOG_DEFAULT);
    if (Object.keys(radioBridgeDeviceCatalog || {}).length === 0) radioBridgeDeviceCatalog = cloneDeepCatalog(RADIO_BRIDGE_CATALOG_DEFAULT);
    if (Object.keys(cabinetDeviceCatalog || {}).length === 0) cabinetDeviceCatalog = cloneDeepCatalog(CABINET_CATALOG_DEFAULT);
    if (Object.keys(switchDeviceCatalog || {}).length === 0) switchDeviceCatalog = cloneDeepCatalog(SWITCH_CATALOG_DEFAULT);
    if (Object.keys(cableDeviceCatalog || {}).length === 0) cableDeviceCatalog = cloneDeepCatalog(CABLE_CATALOG_DEFAULT);
    if (mergeNodeCatalogIntoSwitch()) saveDeviceCatalog();
}

function getCableProductLabel(manufacturer, model) {
    var m = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (m && mod) return m + ' · ' + mod;
    if (mod) return mod;
    if (m) return m;
    return '';
}

function getCableProductFromObject(cableOrProps) {
    if (!cableOrProps) return { manufacturer: '', model: '' };
    var props = cableOrProps.properties ? cableOrProps.properties : cableOrProps;
    var get = typeof props.get === 'function'
        ? function(k) { return props.get(k); }
        : function(k) { return props[k]; };
    return {
        manufacturer: (get('cableManufacturer') || '').trim(),
        model: (get('cableModel') || '').trim()
    };
}

function setCableProductOnObject(cable, manufacturer, model) {
    if (!cable || !cable.properties) return;
    var m = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (m) cable.properties.set('cableManufacturer', m);
    else cable.properties.unset('cableManufacturer');
    if (mod) cable.properties.set('cableModel', mod);
    else cable.properties.unset('cableModel');
}

function applySerializedCableProduct(cable, item) {
    if (!cable || !cable.properties || !item) return;
    var m = item.cableManufacturer != null ? String(item.cableManufacturer).trim() : '';
    var mod = item.cableModel != null ? String(item.cableModel).trim() : '';
    if ('cableManufacturer' in item || 'cableModel' in item) {
        setCableProductOnObject(cable, m, mod);
    }
}

function getLayCableManufacturer() {
    var el = document.getElementById('layCableManufacturer');
    if (el && el.value) return el.value.trim();
    try {
        var s = localStorage.getItem(LAY_CABLE_MFR_KEY);
        if (s) return s.trim();
    } catch (e) {}
    return '';
}

function getLayCableModel() {
    var el = document.getElementById('layCableModel');
    if (el && el.value) return el.value.trim();
    try {
        var s = localStorage.getItem(LAY_CABLE_MODEL_KEY);
        if (s) return s.trim();
    } catch (e) {}
    return '';
}

function setLayCableProduct(manufacturer, model) {
    var m = (manufacturer || '').trim();
    var mod = (model || '').trim();
    try {
        if (m) localStorage.setItem(LAY_CABLE_MFR_KEY, m);
        else localStorage.removeItem(LAY_CABLE_MFR_KEY);
        if (mod) localStorage.setItem(LAY_CABLE_MODEL_KEY, mod);
        else localStorage.removeItem(LAY_CABLE_MODEL_KEY);
    } catch (e) {}
    setDeviceComboboxValue('layCableManufacturer', m, 'Выберите марку');
    setDeviceComboboxValue('layCableModel', mod, 'Выберите модель');
    applyCableModelSettingsToLayPanel(m, mod);
}

function applyLayCableProductToCable(cable) {
    if (!cable || !cable.properties) return;
    var m = getLayCableManufacturer();
    var mod = getLayCableModel();
    if (m || mod) setCableProductOnObject(cable, m, mod);
}

function setDeviceComboboxValue(valueId, value, placeholder) {
    var valueInput = document.getElementById(valueId);
    if (!valueInput) return;
    var wrapper = valueInput.closest('.device-combobox');
    var trigger = wrapper && wrapper.querySelector('.device-combobox-trigger');
    valueInput.value = value || '';
    if (trigger) trigger.textContent = value || placeholder || 'Выберите';
}

function restoreLayCableProductUI() {
    var m = '';
    var mod = '';
    try {
        m = (localStorage.getItem(LAY_CABLE_MFR_KEY) || '').trim();
        mod = (localStorage.getItem(LAY_CABLE_MODEL_KEY) || '').trim();
    } catch (e) {}
    setDeviceComboboxValue('layCableManufacturer', m, 'Выберите марку');
    setDeviceComboboxValue('layCableModel', mod, 'Выберите модель');
    if (m && mod) applyCableModelSettingsToLayPanel(m, mod);
}

function setupLayCableProductHandlers() {
    var mfrInp = document.getElementById('layCableManufacturer');
    var modelInp = document.getElementById('layCableModel');
    if (!mfrInp || mfrInp._layCableProductBound) return;
    mfrInp._layCableProductBound = true;
    function persistLayProduct() {
        setLayCableProduct(getLayCableManufacturer(), getLayCableModel());
    }
    mfrInp.addEventListener('change', function() {
        persistLayProduct();
        applyCableModelSettingsToLayPanel(getLayCableManufacturer(), getLayCableModel());
    });
    if (modelInp) modelInp.addEventListener('change', persistLayProduct);
    restoreLayCableProductUI();
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
        var allowedCatalogKinds = { node: 1, olt: 1, onu: 1, camera: 1, radioBridge: 1, switch: 1, cable: 1, cabinet: 1 };
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

function renderSleeveCatalogList(container, searchQ) {
    var types = getAllSleeveTypes();
    var html = '';
    var visibleCount = 0;
    types.forEach(function(t) {
        var models = [t.label, formatSleeveMaxFibersHint(t.maxFibers)];
        var matches = catalogEntryMatchesSearch(t.id, models, searchQ);
        if (matches) visibleCount++;
        html += '<article class="device-catalog-sleeve-row device-catalog-mfr' + (matches ? '' : ' is-hidden-by-search') + '" data-sleeve-id="' + escapeHtml(t.id) + '">';
        html += '<header class="device-catalog-mfr-header">';
        html += '<div class="device-catalog-mfr-title">';
        html += '<span class="device-catalog-mfr-name device-catalog-model-name">' + escapeHtml(t.id) + '</span>';
        html += '<span class="device-catalog-sleeve-label">' + escapeHtml(t.label) + '</span>';
        html += '<span class="device-catalog-mfr-count">' + escapeHtml(formatSleeveMaxFibersHint(t.maxFibers)) + '</span>';
        if (t.builtin) {
            html += '<span class="device-catalog-sleeve-badge">встроенный</span>';
        }
        html += '</div>';
        html += '<div class="device-catalog-mfr-actions">';
        html += '<button type="button" class="device-catalog-remove-sleeve device-catalog-btn-remove-mfr" data-sleeve-id="' + escapeHtml(t.id) + '" data-sleeve-builtin="' + (t.builtin ? '1' : '0') + '" title="Удалить тип">Удалить</button>';
        html += '</div>';
        html += '</header></article>';
    });
    if (searchQ && visibleCount === 0) {
        html += '<p class="device-catalog-no-results">Ничего не найдено по запросу «' + escapeHtml(searchQ) + '».</p>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.device-catalog-remove-sleeve').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var sid = btn.getAttribute('data-sleeve-id');
            var isBuiltin = btn.getAttribute('data-sleeve-builtin') === '1';
            (async function() {
                var msg = isBuiltin
                    ? 'Убрать встроенный тип муфты «' + sid + '» из списка? Уже созданные муфты на карте не изменятся.'
                    : 'Удалить тип муфты «' + sid + '» из справочника?';
                if (!(await showConfirm(msg, 'Удалить тип', { confirmText: 'Удалить' }))) return;
                if (removeSleeveType(sid)) {
                    renderDeviceCatalogList();
                    refreshAllSleeveTypeSelects();
                    if (typeof showInfo === 'function') showInfo('Тип муфты удалён', '');
                }
            })();
        });
    });
}

function renderCrossCatalogList(container, searchQ) {
    var types = getAllCrossTypes();
    var html = '';
    var visibleCount = 0;
    types.forEach(function(t) {
        var models = [t.label, formatCrossDefaultPortsHint(t.defaultPorts)];
        var matches = catalogEntryMatchesSearch(t.id, models, searchQ);
        if (matches) visibleCount++;
        html += '<article class="device-catalog-cross-row device-catalog-mfr' + (matches ? '' : ' is-hidden-by-search') + '" data-cross-id="' + escapeHtml(t.id) + '">';
        html += '<header class="device-catalog-mfr-header">';
        html += '<div class="device-catalog-mfr-title">';
        html += '<span class="device-catalog-mfr-name device-catalog-model-name">' + escapeHtml(t.id) + '</span>';
        html += '<span class="device-catalog-sleeve-label">' + escapeHtml(t.label) + '</span>';
        html += '<span class="device-catalog-mfr-count">' + escapeHtml(formatCrossDefaultPortsHint(t.defaultPorts)) + '</span>';
        if (t.builtin) {
            html += '<span class="device-catalog-sleeve-badge">встроенный</span>';
        }
        html += '</div>';
        html += '<div class="device-catalog-mfr-actions">';
        html += '<button type="button" class="device-catalog-remove-cross device-catalog-btn-remove-mfr" data-cross-id="' + escapeHtml(t.id) + '" data-cross-builtin="' + (t.builtin ? '1' : '0') + '" title="Удалить тип">Удалить</button>';
        html += '</div>';
        html += '</header></article>';
    });
    if (searchQ && visibleCount === 0) {
        html += '<p class="device-catalog-no-results">Ничего не найдено по запросу «' + escapeHtml(searchQ) + '».</p>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.device-catalog-remove-cross').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var cid = btn.getAttribute('data-cross-id');
            var isBuiltin = btn.getAttribute('data-cross-builtin') === '1';
            (async function() {
                var msg = isBuiltin
                    ? 'Убрать встроенный тип кросса «' + cid + '» из списка? Уже созданные кроссы на карте не изменятся.'
                    : 'Удалить тип кросса «' + cid + '» из справочника?';
                if (!(await showConfirm(msg, 'Удалить тип', { confirmText: 'Удалить' }))) return;
                if (removeCrossType(cid)) {
                    renderDeviceCatalogList();
                    refreshAllCrossTypeSelects();
                    if (typeof showInfo === 'function') showInfo('Тип кросса удалён', '');
                }
            })();
        });
    });
}

function renderSpliceCassetteCatalogList(container, searchQ) {
    var types = getAllSpliceCassetteTypes();
    var html = '';
    var visibleCount = 0;
    types.forEach(function(t) {
        var models = [t.label, formatSpliceCassetteMaxFibersHint(t.maxFibers)];
        var matches = catalogEntryMatchesSearch(t.id, models, searchQ);
        if (matches) visibleCount++;
        html += '<article class="device-catalog-sleeve-row device-catalog-mfr' + (matches ? '' : ' is-hidden-by-search') + '" data-cassette-id="' + escapeHtml(t.id) + '">';
        html += '<header class="device-catalog-mfr-header">';
        html += '<div class="device-catalog-mfr-title">';
        html += '<span class="device-catalog-mfr-name device-catalog-model-name">' + escapeHtml(t.id) + '</span>';
        html += '<span class="device-catalog-sleeve-label">' + escapeHtml(t.label) + '</span>';
        html += '<span class="device-catalog-mfr-count">' + escapeHtml(formatSpliceCassetteMaxFibersHint(t.maxFibers)) + '</span>';
        if (t.builtin) {
            html += '<span class="device-catalog-sleeve-badge">встроенный</span>';
        }
        html += '</div>';
        html += '<div class="device-catalog-mfr-actions">';
        html += '<button type="button" class="device-catalog-remove-cassette device-catalog-btn-remove-mfr" data-cassette-id="' + escapeHtml(t.id) + '" data-cassette-builtin="' + (t.builtin ? '1' : '0') + '" title="Удалить тип">Удалить</button>';
        html += '</div>';
        html += '</header></article>';
    });
    if (searchQ && visibleCount === 0) {
        html += '<p class="device-catalog-no-results">Ничего не найдено по запросу «' + escapeHtml(searchQ) + '».</p>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.device-catalog-remove-cassette').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var cid = btn.getAttribute('data-cassette-id');
            var isBuiltin = btn.getAttribute('data-cassette-builtin') === '1';
            (async function() {
                var msg = isBuiltin
                    ? 'Убрать встроенный тип сплайс-кассеты «' + cid + '» из списка? Уже созданные кассеты не изменятся.'
                    : 'Удалить тип сплайс-кассеты «' + cid + '» из справочника?';
                if (!(await showConfirm(msg, 'Удалить тип', { confirmText: 'Удалить' }))) return;
                if (removeSpliceCassetteType(cid)) {
                    renderDeviceCatalogList();
                    refreshAllSpliceCassetteTypeSelects();
                    if (typeof showInfo === 'function') showInfo('Тип сплайс-кассеты удалён', '');
                }
            })();
        });
    });
}

function renderDeviceCatalogList() {
    var container = document.getElementById('deviceCatalogList');
    if (!container) return;
    var tab = window.deviceCatalogActiveTab || 'switch';
    if (!DEVICE_CATALOG_ALLOWED_TABS[tab]) tab = 'switch';

    var searchQ = getDeviceCatalogSearchQuery();
    updateDeviceCatalogChrome();

    if (tab === 'sleeve') {
        renderSleeveCatalogList(container, searchQ);
        return;
    }

    if (tab === 'cross') {
        renderCrossCatalogList(container, searchQ);
        return;
    }

    if (tab === 'spliceCassette') {
        renderSpliceCassetteCatalogList(container, searchQ);
        return;
    }

    var catalog = getCatalogObjectRef(tab);
    var mfrs = Object.keys(catalog).sort();

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
            html += '<span class="device-catalog-model-tag' + (tab === 'cable' ? ' device-catalog-model-tag--cable' : '') + (tab === 'switch' || tab === 'olt' ? ' device-catalog-model-tag--switch' : '') + (tab === 'radioBridge' ? ' device-catalog-model-tag--switch' : '') + '">';
            html += '<span class="device-catalog-model-name">' + escapeHtml(mod) + '</span>';
            if (tab === 'switch') {
                var defN = getSwitchModelDefaultPortCount(mfr, mod);
                var customPorts = switchModelHasCustomPortTypes(mfr, mod);
                html += '<label class="device-catalog-ports-label" title="Портов по умолчанию при добавлении коммутатора в узел">Портов<input type="number" class="form-input device-catalog-ports-input switch-catalog-def-ports" min="1" max="96" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" value="' + (defN != null ? String(defN) : '') + '" placeholder="—" aria-label="Портов по умолчанию"></label>';
                html += '<button type="button" class="device-catalog-switch-ports-btn' + (customPorts ? ' device-catalog-switch-ports-btn--custom' : '') + '" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" data-catalog-kind="switch" title="Настроить тип каждого порта">';
                html += '<span class="device-catalog-switch-ports-btn__label">Порты</span></button>';
            }
            if (tab === 'olt') {
                var defOltN = getOltModelDefaultPortCount(mfr, mod);
                var customOltPorts = oltModelHasCustomPortTypes(mfr, mod);
                html += '<label class="device-catalog-ports-label" title="PON-портов по умолчанию при добавлении OLT на карту">PON<input type="number" class="form-input device-catalog-ports-input olt-catalog-def-ports" min="1" max="96" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" value="' + (defOltN != null ? String(defOltN) : '') + '" placeholder="—" aria-label="PON-портов по умолчанию"></label>';
                html += '<button type="button" class="device-catalog-switch-ports-btn' + (customOltPorts ? ' device-catalog-switch-ports-btn--custom' : '') + '" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" data-catalog-kind="olt" title="Настроить тип каждого PON-порта">';
                html += '<span class="device-catalog-switch-ports-btn__label">Порты</span></button>';
            }
            if (tab === 'cable') {
                var cableSettings = getCableModelFiberSettings(mfr, mod);
                var cableFc = cableSettings && cableSettings.fiberCount ? cableSettings.fiberCount : '';
                var cableFcHint = inferCableModelFiberCount(mod);
                html += '<label class="device-catalog-ports-label" title="Число жил по умолчанию при прокладке">Жил<input type="number" class="form-input device-catalog-ports-input cable-catalog-fiber-count" min="1" max="96" data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" value="' + (cableFc !== '' ? String(cableFc) : '') + '" placeholder="' + (cableFcHint != null ? String(cableFcHint) : '—') + '" aria-label="Жил по умолчанию"></label>';
                html += getDeviceCatalogPaletteBtnHtml(
                    cableModelHasCustomPalette(mfr, mod) ? ' device-catalog-cable-palette-btn--custom' : '',
                    'data-mfr="' + escapeHtml(mfr) + '" data-model="' + escapeHtml(mod) + '" title="Настроить цвета жил"'
                );
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
            (async function() {
                if (!(await showConfirm('Удалить модель «' + mod + '»' + (mfr ? ' (' + mfr + ')' : '') + '?', 'Удалить модель', { confirmText: 'Удалить' }))) return;
                if (removeModelForCatalog(tab, mfr, mod)) {
                    renderDeviceCatalogList();
                    populateDeviceDatalists();
                    populateModelDatalistForManufacturer(mfr, 'deviceModelsList', tab);
                    if (typeof showInfo === 'function') showInfo('Модель удалена', '');
                }
            })();
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
        container.querySelectorAll('.device-catalog-switch-ports-btn[data-catalog-kind="switch"]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                openSwitchModelPortsEditor(btn.getAttribute('data-mfr'), btn.getAttribute('data-model'), { catalogKind: 'switch' });
            });
        });
    }
    if (tab === 'olt') {
        container.querySelectorAll('.olt-catalog-def-ports').forEach(function(inp) {
            inp.addEventListener('change', function() {
                var mf = this.getAttribute('data-mfr');
                var md = this.getAttribute('data-model');
                var v = parseInt(this.value, 10);
                if (isNaN(v) || v < 1) {
                    setOltModelDefaultPortCount(mf, md, null);
                    this.value = '';
                } else {
                    setOltModelDefaultPortCount(mf, md, v);
                    this.value = String(Math.min(96, Math.max(1, v)));
                }
            });
        });
        container.querySelectorAll('.device-catalog-switch-ports-btn[data-catalog-kind="olt"]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                openSwitchModelPortsEditor(btn.getAttribute('data-mfr'), btn.getAttribute('data-model'), { catalogKind: 'olt' });
            });
        });
    }
    if (tab === 'cable') {
        container.querySelectorAll('.cable-catalog-fiber-count').forEach(function(inp) {
            inp.addEventListener('change', function() {
                var mf = this.getAttribute('data-mfr');
                var md = this.getAttribute('data-model');
                var v = parseInt(this.value, 10);
                if (isNaN(v) || v < 1) {
                    setCableModelFiberCount(mf, md, null);
                    this.value = '';
                } else {
                    setCableModelFiberCount(mf, md, v);
                    this.value = String(Math.min(96, Math.max(1, v)));
                }
            });
        });
        container.querySelectorAll('.device-catalog-cable-palette-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var mf = btn.getAttribute('data-mfr');
                var md = btn.getAttribute('data-model');
                var rowInp = btn.closest('.device-catalog-model-tag');
                rowInp = rowInp ? rowInp.querySelector('.cable-catalog-fiber-count') : null;
                var fcOverride = rowInp && rowInp.value ? parseInt(rowInp.value, 10) : null;
                openCableCatalogPaletteEditor(mf, md, fcOverride);
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
    var tab = getActiveDeviceCatalogTab();
    var mfrPanel = document.getElementById('deviceCatalogEntryMfrPanel');
    var modelPanel = document.getElementById('deviceCatalogEntryModelPanel');
    var sleevePanel = document.getElementById('deviceCatalogEntrySleevePanel');
    var crossPanel = document.getElementById('deviceCatalogEntryCrossPanel');
    var cassettePanel = document.getElementById('deviceCatalogEntryCassettePanel');
    var typeTabs = document.querySelector('.device-catalog-entry-type-tabs');
    if (tab === 'sleeve') {
        if (typeTabs) typeTabs.hidden = true;
        if (mfrPanel) mfrPanel.hidden = true;
        if (modelPanel) modelPanel.hidden = true;
        if (crossPanel) crossPanel.hidden = true;
        if (cassettePanel) cassettePanel.hidden = true;
        if (sleevePanel) sleevePanel.hidden = false;
        syncDeviceCatalogEntryPortsGroupVisibility();
        return;
    }
    if (tab === 'cross') {
        if (typeTabs) typeTabs.hidden = true;
        if (mfrPanel) mfrPanel.hidden = true;
        if (modelPanel) modelPanel.hidden = true;
        if (sleevePanel) sleevePanel.hidden = true;
        if (cassettePanel) cassettePanel.hidden = true;
        if (crossPanel) crossPanel.hidden = false;
        syncDeviceCatalogEntryPortsGroupVisibility();
        return;
    }
    if (tab === 'spliceCassette') {
        if (typeTabs) typeTabs.hidden = true;
        if (mfrPanel) mfrPanel.hidden = true;
        if (modelPanel) modelPanel.hidden = true;
        if (sleevePanel) sleevePanel.hidden = true;
        if (crossPanel) crossPanel.hidden = true;
        if (cassettePanel) cassettePanel.hidden = false;
        syncDeviceCatalogEntryPortsGroupVisibility();
        return;
    }
    if (typeTabs) typeTabs.hidden = false;
    if (sleevePanel) sleevePanel.hidden = true;
    if (crossPanel) crossPanel.hidden = true;
    if (cassettePanel) cassettePanel.hidden = true;
    var isMfr = entryType === 'manufacturer';
    document.querySelectorAll('.device-catalog-entry-type').forEach(function(btn) {
        var active = btn.getAttribute('data-entry-type') === entryType;
        btn.classList.toggle('device-catalog-entry-type-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (mfrPanel) mfrPanel.hidden = !isMfr;
    if (modelPanel) modelPanel.hidden = isMfr;
    syncDeviceCatalogEntryPortsGroupVisibility();
}

function syncDeviceCatalogEntryPortsGroupVisibility() {
    var portsGroup = document.getElementById('deviceCatalogEntryPortsGroup');
    if (!portsGroup) return;
    var tab = getActiveDeviceCatalogTab();
    var entryType = (document.querySelector('.device-catalog-entry-type-active') || {}).getAttribute('data-entry-type');
    portsGroup.hidden = (tab !== 'switch' && tab !== 'olt') || entryType !== 'model';
    var hintEl = document.querySelector('.device-catalog-entry-ports-hint');
    var portsLabel = portsGroup.querySelector('.device-catalog-entry-ports-field-label');
    if (hintEl) {
        hintEl.textContent = tab === 'olt'
            ? 'Подставится при добавлении OLT на карту'
            : 'Подставится при добавлении коммутатора в узел на карте';
    }
    if (portsLabel) {
        portsLabel.textContent = tab === 'olt' ? 'PON-портов по умолчанию' : 'Портов по умолчанию';
    }
    var portsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
    if (portsInp) portsInp.placeholder = tab === 'olt' ? '8' : '24';
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
    var cableFibersGroup = document.getElementById('deviceCatalogEntryCableFibersGroup');
    if (hint) hint.textContent = 'Раздел: «' + meta.label + '». ' + meta.desc;
    if (cableFibersGroup) cableFibersGroup.hidden = tab !== 'cable';
    syncDeviceCatalogEntryPortsGroupVisibility();
    setDeviceCatalogEntryType(tab === 'sleeve' ? 'sleeve' : (tab === 'cross' ? 'cross' : (tab === 'spliceCassette' ? 'spliceCassette' : ((document.querySelector('.device-catalog-entry-type-active') || {}).getAttribute('data-entry-type') || 'manufacturer'))));
}

function openDeviceCatalogEntryModal(entryType, presetMfr) {
    var modal = document.getElementById('deviceCatalogEntryModal');
    if (!modal) return;
    var tab = getActiveDeviceCatalogTab();
    entryType = entryType === 'model' ? 'model' : 'manufacturer';
    updateDeviceCatalogEntryModalChrome();
    refreshDeviceCatalogEntryMfrSelect(presetMfr || '');
    if (tab !== 'sleeve' && tab !== 'cross' && tab !== 'spliceCassette') setDeviceCatalogEntryType(entryType);

    var mfrNameInp = document.getElementById('deviceCatalogEntryMfrName');
    var modelNameInp = document.getElementById('deviceCatalogEntryModelName');
    var portsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
    var cableFibersInp = document.getElementById('deviceCatalogEntryCableFibers');
    var sleeveIdInp = document.getElementById('deviceCatalogEntrySleeveId');
    var sleeveLabelInp = document.getElementById('deviceCatalogEntrySleeveLabel');
    var crossIdInp = document.getElementById('deviceCatalogEntryCrossId');
    var crossLabelInp = document.getElementById('deviceCatalogEntryCrossLabel');
    var crossPortsInp = document.getElementById('deviceCatalogEntryCrossPorts');
    var cassetteIdInp = document.getElementById('deviceCatalogEntryCassetteId');
    var cassetteLabelInp = document.getElementById('deviceCatalogEntryCassetteLabel');
    var cassetteFibersInp = document.getElementById('deviceCatalogEntryCassetteFibers');
    if (mfrNameInp) mfrNameInp.value = '';
    if (modelNameInp) modelNameInp.value = '';
    if (portsInp) portsInp.value = '';
    if (cableFibersInp) cableFibersInp.value = '';
    _cableEntryPendingFiber = null;
    _switchEntryPendingPortTypes = null;
    _oltEntryPendingPortTypes = null;
    syncCableEntryPaletteBtnState();
    syncCatalogEntryPortsBtnState();
    if (sleeveIdInp) sleeveIdInp.value = '';
    if (sleeveLabelInp) sleeveLabelInp.value = '';
    if (crossIdInp) crossIdInp.value = '';
    if (crossLabelInp) crossLabelInp.value = '';
    if (crossPortsInp) crossPortsInp.value = '';
    if (cassetteIdInp) cassetteIdInp.value = '';
    if (cassetteLabelInp) cassetteLabelInp.value = '';
    if (cassetteFibersInp) cassetteFibersInp.value = '';
    if (entryType === 'model' && presetMfr) {
        var sel = document.getElementById('deviceCatalogEntryMfrSelect');
        if (sel) sel.value = presetMfr;
    }

    var titleEl = document.getElementById('deviceCatalogEntryModalTitle');
    if (titleEl) {
        titleEl.textContent = tab === 'sleeve'
            ? 'Добавить тип муфты'
            : (tab === 'cross'
                ? 'Добавить тип кросса'
                : (tab === 'spliceCassette'
                    ? 'Добавить тип сплайс-кассеты'
                    : (entryType === 'model' ? 'Добавить модель' : 'Добавить производителя')));
    }

    modal.style.display = 'flex';
    requestAnimationFrame(function () {
        if (typeof window.initPanelPlexusCanvases === 'function') {
            window.initPanelPlexusCanvases(modal);
        }
    });
    var focusEl = tab === 'sleeve'
        ? document.getElementById('deviceCatalogEntrySleeveId')
        : (tab === 'cross'
            ? document.getElementById('deviceCatalogEntryCrossId')
            : (tab === 'spliceCassette'
                ? document.getElementById('deviceCatalogEntryCassetteId')
                : (entryType === 'model'
                    ? (document.getElementById('deviceCatalogEntryModelName') || document.getElementById('deviceCatalogEntryMfrSelect'))
                    : document.getElementById('deviceCatalogEntryMfrName'))));
    if (focusEl) setTimeout(function() { focusEl.focus(); }, 50);
}

function closeDeviceCatalogEntryModal() {
    closeSwitchModelPortsModal();
    var modal = document.getElementById('deviceCatalogEntryModal');
    if (modal) modal.style.display = 'none';
    _switchEntryPendingPortTypes = null;
    _oltEntryPendingPortTypes = null;
    syncCatalogEntryPortsBtnState();
}

function saveDeviceCatalogEntrySleeve() {
    var idInp = document.getElementById('deviceCatalogEntrySleeveId');
    var labelInp = document.getElementById('deviceCatalogEntrySleeveLabel');
    var id = idInp ? idInp.value.trim() : '';
    if (!id) {
        if (typeof showError === 'function') showError('Введите код типа муфты', '');
        return;
    }
    if (id === 'custom') {
        if (typeof showError === 'function') showError('Код «custom» зарезервирован для ручного ввода на карте', '');
        return;
    }
    var label = labelInp ? labelInp.value.trim() : '';
    if (findSleeveTypeById(id)) {
        if (typeof showError === 'function') showError('Такой тип муфты уже есть в справочнике', '');
        return;
    }
    if (!addCustomSleeveType(id, label, 0)) {
        if (typeof showError === 'function') showError('Не удалось добавить тип муфты', '');
        return;
    }
    closeDeviceCatalogEntryModal();
    renderDeviceCatalogList();
    refreshAllSleeveTypeSelects();
    if (typeof showInfo === 'function') showInfo('Тип муфты добавлен', '');
}

function saveDeviceCatalogEntryCross() {
    var idInp = document.getElementById('deviceCatalogEntryCrossId');
    var labelInp = document.getElementById('deviceCatalogEntryCrossLabel');
    var portsInp = document.getElementById('deviceCatalogEntryCrossPorts');
    var id = idInp ? idInp.value.trim() : '';
    if (!id) {
        if (typeof showError === 'function') showError('Введите код типа кросса', '');
        return;
    }
    if (id === 'custom') {
        if (typeof showError === 'function') showError('Код «custom» зарезервирован для ручного ввода на карте', '');
        return;
    }
    var label = labelInp ? labelInp.value.trim() : '';
    var ports = portsInp ? parseInt(portsInp.value, 10) : 24;
    if (isNaN(ports) || ports < 1) ports = 24;
    if (findCrossTypeById(id)) {
        if (typeof showError === 'function') showError('Такой тип кросса уже есть в справочнике', '');
        return;
    }
    if (!addCustomCrossType(id, label, ports)) {
        if (typeof showError === 'function') showError('Не удалось добавить тип кросса', '');
        return;
    }
    closeDeviceCatalogEntryModal();
    renderDeviceCatalogList();
    refreshAllCrossTypeSelects();
    if (typeof showInfo === 'function') showInfo('Тип кросса добавлен', '');
}

function saveDeviceCatalogEntryCassette() {
    var idInp = document.getElementById('deviceCatalogEntryCassetteId');
    var labelInp = document.getElementById('deviceCatalogEntryCassetteLabel');
    var fibersInp = document.getElementById('deviceCatalogEntryCassetteFibers');
    var id = idInp ? idInp.value.trim() : '';
    if (!id) {
        if (typeof showError === 'function') showError('Введите код типа сплайс-кассеты', '');
        return;
    }
    if (id === 'custom') {
        if (typeof showError === 'function') showError('Код «custom» зарезервирован для ручного ввода', '');
        return;
    }
    var label = labelInp ? labelInp.value.trim() : '';
    var maxFibers = fibersInp ? parseInt(fibersInp.value, 10) : 0;
    if (isNaN(maxFibers) || maxFibers < 0) maxFibers = 0;
    if (findSpliceCassetteTypeById(id)) {
        if (typeof showError === 'function') showError('Такой тип сплайс-кассеты уже есть в справочнике', '');
        return;
    }
    if (!addCustomSpliceCassetteType(id, label, maxFibers)) {
        if (typeof showError === 'function') showError('Не удалось добавить тип сплайс-кассеты', '');
        return;
    }
    closeDeviceCatalogEntryModal();
    renderDeviceCatalogList();
    refreshAllSpliceCassetteTypeSelects();
    if (typeof showInfo === 'function') showInfo('Тип сплайс-кассеты добавлен', '');
}

function saveDeviceCatalogEntry() {
    var tab = getActiveDeviceCatalogTab();
    if (tab === 'sleeve') {
        saveDeviceCatalogEntrySleeve();
        return;
    }
    if (tab === 'cross') {
        saveDeviceCatalogEntryCross();
        return;
    }
    if (tab === 'spliceCassette') {
        saveDeviceCatalogEntryCassette();
        return;
    }
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
        var portsInpSave = document.getElementById('deviceCatalogEntryDefaultPorts');
        var pv = portsInpSave ? parseInt(portsInpSave.value, 10) : NaN;
        if (_switchEntryPendingPortTypes && _switchEntryPendingPortTypes.length) {
            setSwitchModelPortTypes(mfr, model, _switchEntryPendingPortTypes);
        } else if (!isNaN(pv) && pv >= 1) {
            setSwitchModelDefaultPortCount(mfr, model, Math.min(96, pv));
        }
        _switchEntryPendingPortTypes = null;
    }
    if (tab === 'olt') {
        var portsInpOlt = document.getElementById('deviceCatalogEntryDefaultPorts');
        var pvOlt = portsInpOlt ? parseInt(portsInpOlt.value, 10) : NaN;
        if (_oltEntryPendingPortTypes && _oltEntryPendingPortTypes.length) {
            setOltModelPortTypes(mfr, model, _oltEntryPendingPortTypes);
        } else if (!isNaN(pvOlt) && pvOlt >= 1) {
            setOltModelDefaultPortCount(mfr, model, Math.min(96, pvOlt));
        }
        _oltEntryPendingPortTypes = null;
    }
    if (tab === 'cable') {
        var fibersInpSave = document.getElementById('deviceCatalogEntryCableFibers');
        var fv = fibersInpSave ? parseInt(fibersInpSave.value, 10) : NaN;
        if (_cableEntryPendingFiber && _cableEntryPendingFiber.fiberCount) {
            setCableModelFiberCount(mfr, model, _cableEntryPendingFiber.fiberCount);
            setCableModelFiberPalette(mfr, model, _cableEntryPendingFiber.palette || null);
        } else if (!isNaN(fv) && fv >= 1) {
            setCableModelFiberCount(mfr, model, Math.min(96, fv));
        } else {
            var inferred = inferCableModelFiberCount(model);
            if (inferred) setCableModelFiberCount(mfr, model, inferred);
        }
        _cableEntryPendingFiber = null;
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

    var cableEntryPaletteBtn = document.getElementById('deviceCatalogEntryCablePaletteBtn');
    if (cableEntryPaletteBtn && !cableEntryPaletteBtn._bound) {
        cableEntryPaletteBtn._bound = true;
        cableEntryPaletteBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openCableCatalogEntryPaletteEditor();
        });
    }

    var switchEntryPortsBtn = document.getElementById('deviceCatalogEntrySwitchPortsBtn');
    if (switchEntryPortsBtn && !switchEntryPortsBtn._bound) {
        switchEntryPortsBtn._bound = true;
        switchEntryPortsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openSwitchModelPortsEditor('', '', { entryMode: true });
        });
    }

    var switchEntryPortsInp = document.getElementById('deviceCatalogEntryDefaultPorts');
    if (switchEntryPortsInp && !switchEntryPortsInp._catalogPortsSyncBound) {
        switchEntryPortsInp._catalogPortsSyncBound = true;
        switchEntryPortsInp.addEventListener('change', function() {
            var tab = typeof getActiveDeviceCatalogTab === 'function' ? getActiveDeviceCatalogTab() : 'switch';
            var pending = tab === 'olt' ? _oltEntryPendingPortTypes : _switchEntryPendingPortTypes;
            if (!pending || !pending.length) return;
            var n = parseInt(this.value, 10);
            if (isNaN(n) || n < 1) return;
            n = Math.min(96, Math.max(1, n));
            var pad = pending[pending.length - 1] || getCatalogPortDefaultKind(tab === 'olt' ? 'olt' : 'switch');
            if (tab === 'olt') {
                _oltEntryPendingPortTypes = normalizeOltPortTypesList(n, pending, pad);
            } else {
                _switchEntryPendingPortTypes = normalizeSwitchPortTypesList(n, pending, pad);
            }
        });
    }

    var cancelBtn = document.getElementById('deviceCatalogEntryCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeviceCatalogEntryModal);

    var closeBtn = document.querySelector('.close-device-catalog-entry');
    if (closeBtn) closeBtn.addEventListener('click', closeDeviceCatalogEntryModal);

    entryModal.addEventListener('click', function(e) {
        if (e.target === entryModal) closeDeviceCatalogEntryModal();
    });

    ['deviceCatalogEntryMfrName', 'deviceCatalogEntryModelName', 'deviceCatalogEntrySleeveId', 'deviceCatalogEntrySleeveLabel', 'deviceCatalogEntryCrossId', 'deviceCatalogEntryCrossLabel', 'deviceCatalogEntryCrossPorts', 'deviceCatalogEntryCableFibers'].forEach(function(id) {
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
    setupSwitchModelPortsModalHandlers();

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
                var resetMsg = tab === 'sleeve'
                    ? 'Вернуть полный заводской список типов муфт? Будут восстановлены все встроенные типы и удалены добавленные вами.'
                    : (tab === 'cross'
                        ? 'Вернуть полный заводской список типов кроссов? Будут восстановлены все встроенные типы и удалены добавленные вами.'
                        : (tab === 'spliceCassette'
                            ? 'Вернуть полный заводской список типов сплайс-кассет? Будут восстановлены все встроенные типы и удалены добавленные вами.'
                            : 'Сбросить раздел «' + meta.label + '» к заводским значениям? Ваши правки в этом разделе будут заменены.'));
                if (!(await showConfirm(resetMsg, 'Сброс раздела', { confirmText: 'Сбросить' }))) return;
                resetDeviceCatalogTabToDefault(tab);
                renderDeviceCatalogList();
                populateDeviceDatalists();
                if (tab === 'sleeve') refreshAllSleeveTypeSelects();
                if (tab === 'cross') refreshAllCrossTypeSelects();
                if (tab === 'spliceCassette') refreshAllSpliceCassetteTypeSelects();
                if (typeof showInfo === 'function') showInfo('Раздел «' + meta.label + '» сброшен', '');
            })();
        });
    }
}

function ensureAccordionContentInners() {
    document.querySelectorAll('.accordion-content').forEach(function(content) {
        if (content.querySelector(':scope > .accordion-content-inner')) return;
        var inner = document.createElement('div');
        inner.className = 'accordion-content-inner';
        while (content.firstChild) {
            inner.appendChild(content.firstChild);
        }
        content.appendChild(inner);
    });
}

function setupAccordions() {
    ensureAccordionContentInners();
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
    closeSwitchModelPortsModal();
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
