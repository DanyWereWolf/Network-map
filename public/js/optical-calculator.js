/**
 * js/optical-calculator.js
 * Калькулятор оптического бюджета + управление uplink-портами OLT + уровень сигнала на трассе.
 * Не заменяет существующую трассировку (traceModal) и приход OLT (oltSelectionModal).
 */
(function() {
    'use strict';

    var FIBER_ATTENUATION = {
        'smf-28':      { '1310': 0.35, '1490': 0.25, '1550': 0.20 },
        'smf-28-1550': { '1550': 0.18 },
        'om3':         { '850': 0.35, '1300': 0.50 },
        'om4':         { '850': 0.30, '1300': 0.50 }
    };

    var CONNECTOR_LOSSES = {
        'SC/APC': 0.3, 'SC/PC': 0.5, 'SC/UPC': 0.4,
        'LC/APC': 0.3, 'LC/PC': 0.5, 'LC/UPC': 0.4,
        'FC/APC': 0.3, 'FC/PC': 0.5
    };

    var SPLICE_LOSSES = {
        'fusion-excellent': 0.05,
        'fusion-good':      0.10,
        'fusion-poor':      0.30,
        'mechanical':       0.50,
        'manual':           0
    };

    var SPLITTER_LOSSES = {
        '1:2':  { ideal: 3.5,  excess: 0.5, uniformity: 0.3 },
        '1:4':  { ideal: 7.0,  excess: 0.5, uniformity: 0.4 },
        '1:8':  { ideal: 10.5, excess: 0.6, uniformity: 0.5 },
        '1:16': { ideal: 14.0, excess: 0.7, uniformity: 0.6 },
        '1:32': { ideal: 17.5, excess: 0.8, uniformity: 0.7 },
        '1:64': { ideal: 21.0, excess: 1.0, uniformity: 0.8 }
    };

    var OPERATIONAL_MARGIN_DB = 3;
    var GPON_DEFAULT_WAVELENGTH = {
        'olt': { tx: 1490, rx: 1310 },
        'onu': { tx: 1310, rx: 1490 }
    };

    // Локальный fallback, если device-catalog ещё не загружен (deferred).
    var LOCAL_OLT_OPTICAL = {
        'Huawei': [
            { model: 'MA5608T', ponPorts: 8, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 0,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' },
            { model: 'MA5683T', ponPorts: 16, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' },
            { model: 'MA5800-X7', ponPorts: 16, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 4,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 32,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' }
        ],
        'ZTE': [
            { model: 'C300', ponPorts: 16, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' },
            { model: 'C320', ponPorts: 8, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' },
            { model: 'C600', ponPorts: 16, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 4,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 32,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' }
        ],
        'FiberHome': [
            { model: 'AN5516-01', ponPorts: 8, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'B+' },
            { model: 'AN5516-06', ponPorts: 16, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' }
        ],
        'Eltex': [
            { model: 'LTP-8X', ponPorts: 8, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 0,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'B+' },
            { model: 'LTP-4X', ponPorts: 4, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 0,
              rj45Ports: 2, syncPorts: 0, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 28,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'B+' }
        ],
        'BDCOM': [
            { model: 'P3310C', ponPorts: 8, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 2,
              rj45Ports: 1, syncPorts: 0, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 30,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'B+' },
            { model: 'P3608B', ponPorts: 8, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 0, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 31,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' }
        ],
        'SNR': [
            { model: 'SNR-GPON-OLT', ponPorts: 8, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 2,
              rj45Ports: 2, syncPorts: 0, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 30,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'B+' }
        ],
        'B-OptiX': [
            { model: 'BO-GPON-OLT', ponPorts: 8, uplinkSfpPorts: 2, uplinkSfpPlusPorts: 0,
              rj45Ports: 1, syncPorts: 0, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 28,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'B+' }
        ],
        'Nokia': [
            { model: '7360 ISAM FX', ponPorts: 16, uplinkSfpPorts: 4, uplinkSfpPlusPorts: 4,
              rj45Ports: 2, syncPorts: 1, consolePorts: 1,
              txPowerDbm: 3, rxSensitivityDbm: -28, budgetDb: 32,
              wavelengthTxNm: 1490, wavelengthRxNm: 1310, connectorType: 'SC/APC', defaultPonSfpClass: 'C+' }
        ]
    };

    var LOCAL_SFP = {
        'Huawei': [
            { model: 'SFP-10G-LR-SM1310', type: 'SFP+', speed: '10G',
              wavelengthNm: 1310, fiberType: 'single-mode', maxDistanceKm: 10, connectorType: 'LC',
              txPowerMinDbm: -8.2, txPowerMaxDbm: 0.5,
              rxSensitivityDbm: -14.4, rxSaturationDbm: 0.5,
              budgetDb: 6.2, ddm: true,
              compatibleWith: ['olt', 'switch'] },
            { model: 'SFP-GE-LX-SM1310', type: 'SFP', speed: '1G',
              wavelengthNm: 1310, fiberType: 'single-mode', maxDistanceKm: 10, connectorType: 'LC',
              txPowerMinDbm: -9.5, txPowerMaxDbm: -3,
              rxSensitivityDbm: -20, rxSaturationDbm: -3,
              budgetDb: 10.5, ddm: true,
              compatibleWith: ['olt', 'switch', 'mediaConverter'] }
        ]
    };

    function safeGetObjects() {
        if (typeof objects !== 'undefined') return objects;
        if (typeof window.objects !== 'undefined') return window.objects;
        return [];
    }

    function safeShowWarning(message, title) {
        if (typeof showWarning === 'function') return showWarning(message, title);
        if (typeof showError === 'function') return showError(message, title);
        console.warn('[Warning]', title, message);
    }

    function safeShowInfo(message, title) {
        if (typeof showInfo === 'function') return showInfo(message, title);
        console.log('[Info]', title, message);
    }

    function safeEscapeHtml(s) {
        if (typeof escapeHtml === 'function') return escapeHtml(s);
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function safeSyncPush(obj) {
        if (!obj) return;
        if (typeof syncPushObjectUpdate === 'function') return syncPushObjectUpdate(obj, true);
        if (typeof window.syncSendState === 'function' && typeof getSerializedData === 'function') {
            window.syncSendState(getSerializedData());
        }
    }

    function safeAddHistory(entry) {
        if (!entry) return;
        if (typeof window.logAction === 'function') return window.logAction(entry);
        if (typeof window.addHistoryEntry === 'function') return window.addHistoryEntry(entry);
        console.log('[History]', entry);
    }

    function safeDeleteObject(obj, opts) {
        if (!obj) return false;
        if (obj.properties && obj.properties.get('type') === 'cable') {
            var cuid = obj.properties.get('uniqueId');
            if (cuid && typeof deleteCableByUniqueId === 'function') {
                deleteCableByUniqueId(cuid, opts || {});
                return true;
            }
            if (cuid && typeof window.confirmAndDeleteCable === 'function') {
                // без confirm при отмене выбора порта
                if (typeof deleteCableByUniqueId === 'function') {
                    deleteCableByUniqueId(cuid, opts || {});
                    return true;
                }
            }
        }
        if (typeof window.deleteObject === 'function') return window.deleteObject(obj, opts || {});
        return false;
    }

    function safeGetSfpParams(manufacturer, model) {
        if (typeof window.getSfpParams === 'function') return window.getSfpParams(manufacturer, model);
        if (!LOCAL_SFP[manufacturer]) return null;
        var models = LOCAL_SFP[manufacturer];
        for (var i = 0; i < models.length; i++) {
            if (models[i].model === model) return models[i];
        }
        return null;
    }

    function safeGetDeviceOpticalParams(type, manufacturer, model) {
        if (typeof window.getDeviceOpticalParams === 'function') {
            var fromCatalog = window.getDeviceOpticalParams(type, manufacturer, model);
            if (fromCatalog) return fromCatalog;
        }
        if (type !== 'olt' || !LOCAL_OLT_OPTICAL[manufacturer]) return null;
        var models = LOCAL_OLT_OPTICAL[manufacturer];
        for (var i = 0; i < models.length; i++) {
            if (models[i].model === model) return models[i];
        }
        return null;
    }

    function safeRefreshObjectModal(obj) {
        if (!obj) return;
        if (typeof refreshObjectModal === 'function') return refreshObjectModal(obj);
        if (typeof window.refreshObjectModal === 'function') return window.refreshObjectModal(obj);
    }

    function safeGetCurrentModalObject() {
        if (typeof currentModalObject !== 'undefined') return currentModalObject;
        if (typeof window.currentModalObject !== 'undefined') return window.currentModalObject;
        return null;
    }

    function safeGetObjectUniqueId(obj) {
        if (!obj) return null;
        if (typeof getObjectUniqueId === 'function') return getObjectUniqueId(obj);
        if (obj.properties && typeof obj.properties.get === 'function') return obj.properties.get('uniqueId');
        return null;
    }

    function safeFindObjectAtCoords(coords, tolerance) {
        if (!coords || coords.length < 2) return null;
        if (typeof window.findObjectAtCoords === 'function') {
            return window.findObjectAtCoords(coords, tolerance);
        }
        if (typeof findObjectAtCoords === 'function') {
            return findObjectAtCoords(coords, tolerance);
        }
        var objs = safeGetObjects();
        var lat = coords[0], lon = coords[1];
        for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (!o.geometry || typeof o.geometry.getCoordinates !== 'function') continue;
            if (o.geometry.getType && o.geometry.getType() !== 'Point') continue;
            var oc = o.geometry.getCoordinates();
            if (!Array.isArray(oc) || oc.length < 2) continue;
            if (Math.abs(oc[0] - lat) < 0.0001 && Math.abs(oc[1] - lon) < 0.0001) return o;
        }
        return null;
    }

    function isFiberHostEnd(obj) {
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        if (typeof isFiberHostType === 'function') return isFiberHostType(t);
        return t === 'sleeve' || t === 'cross' || t === 'spliceCassette';
    }

    function cableLengthKm(cable) {
        if (!cable || !cable.properties) return 0;
        var km = cable.properties.get('lengthKm');
        if (km != null && km !== '' && !isNaN(parseFloat(km))) return parseFloat(km);
        var distM = cable.properties.get('distance');
        if (distM != null && distM !== '' && !isNaN(parseFloat(distM))) return parseFloat(distM) / 1000;
        // Fallback: длина по геометрии полилинии
        try {
            if (cable.geometry && typeof cable.geometry.getCoordinates === 'function') {
                var coords = cable.geometry.getCoordinates();
                if (Array.isArray(coords) && coords.length >= 2) {
                    if (typeof polylineLength === 'function') return polylineLength(coords) / 1000;
                    if (typeof calculateDistance === 'function') {
                        var sum = 0;
                        for (var i = 0; i < coords.length - 1; i++) {
                            sum += calculateDistance(coords[i], coords[i + 1]);
                        }
                        return sum / 1000;
                    }
                }
            }
        } catch (eLen) {}
        return 0;
    }

    /** Длина участка хост→ONU по линии связи (м). */
    function measureOnuLinkDistanceM(hostObj, onuObj, routeIds) {
        if (typeof measureHostToOnuDropDistanceM === 'function') {
            return measureHostToOnuDropDistanceM(hostObj, onuObj, routeIds) || 0;
        }
        if (!hostObj || !onuObj || !hostObj.geometry || !onuObj.geometry) return 0;
        try {
            var coords = [hostObj.geometry.getCoordinates()];
            if (routeIds && routeIds.length && typeof gponRouteWaypointCoords === 'function') {
                coords = coords.concat(gponRouteWaypointCoords(routeIds) || []);
            }
            coords.push(onuObj.geometry.getCoordinates());
            if (typeof polylineLength === 'function') return polylineLength(coords);
            if (typeof calculateDistance !== 'function') return 0;
            var sum = 0;
            for (var i = 0; i < coords.length - 1; i++) {
                sum += calculateDistance(coords[i], coords[i + 1]);
            }
            return sum;
        } catch (e) {
            return 0;
        }
    }

    function normalizeSplitterRatio(node) {
        if (!node || !node.properties) return '1:8';
        var ratio = node.properties.get('splitterRatio');
        if (ratio && SPLITTER_LOSSES[ratio]) return ratio;
        var splitRatio = node.properties.get('splitRatio');
        if (splitRatio != null && splitRatio !== '') {
            var n = parseInt(splitRatio, 10);
            if (!isNaN(n) && n > 0) {
                var key = '1:' + n;
                if (SPLITTER_LOSSES[key]) return key;
            }
        }
        return '1:8';
    }

    function calculateFiberLoss(fiberType, wavelengthNm, lengthKm) {
        if (!lengthKm || lengthKm <= 0) return 0;
        var wl = String(wavelengthNm);
        var att = (FIBER_ATTENUATION[fiberType] && FIBER_ATTENUATION[fiberType][wl]) || 0.2;
        return lengthKm * att;
    }

    function calculateDeviceSpliceLoss(device) {
        if (!device || !device.properties) return 0;
        if (!device.properties.get('useSpliceLoss')) return 0;
        var spliceType = device.properties.get('spliceType') || 'manual';
        var lossPer = SPLICE_LOSSES[spliceType];
        if (lossPer === undefined) {
            lossPer = device.properties.get('spliceLossDb') || 0;
        }
        var count = device.properties.get('spliceCount') || 0;
        return count * lossPer;
    }

    function calculateCrossConnectorLoss(cross) {
        if (!cross || !cross.properties) return 0;
        if (!cross.properties.get('useConnectorLoss')) return 0;
        var count = cross.properties.get('connectorCount') || 0;
        var lossPer = cross.properties.get('connectorLossDb') || 0;
        return count * lossPer;
    }

    function getOltPortByIndex(oltObj, portIndex) {
        if (!oltObj || !oltObj.properties || portIndex == null) return null;
        var ports = oltObj.properties.get('ports') || [];
        for (var i = 0; i < ports.length; i++) {
            if (ports[i] && Number(ports[i].portIndex) === Number(portIndex)) return ports[i];
        }
        return null;
    }

    /** SFP на PON-порту (portNumber 1-based) или на uplink (portIndex). */
    function getOltInstalledSfp(oltObj, opts) {
        opts = opts || {};
        if (!oltObj || !oltObj.properties) return null;
        if (!oltObj.properties.get('ports') || !oltObj.properties.get('ports').length) {
            if (typeof buildOltPorts === 'function') buildOltPorts(oltObj);
        }
        var port = null;
        if (opts.portNumber != null) {
            port = getOltPortByIndex(oltObj, parseInt(opts.portNumber, 10) - 1);
        } else if (opts.portIndex != null) {
            port = getOltPortByIndex(oltObj, opts.portIndex);
        }
        return (port && port.installedSfp) ? port.installedSfp : null;
    }

    function setOltInstalledSfp(oltObj, opts, sfpRef) {
        opts = opts || {};
        if (!oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return false;
        if (!oltObj.properties.get('ports') || !oltObj.properties.get('ports').length) {
            buildOltPorts(oltObj);
        }
        var portIndex = opts.portIndex;
        if (portIndex == null && opts.portNumber != null) {
            portIndex = parseInt(opts.portNumber, 10) - 1;
        }
        if (portIndex == null || isNaN(portIndex)) return false;
        var ports = oltObj.properties.get('ports') || [];
        var found = false;
        for (var i = 0; i < ports.length; i++) {
            if (ports[i] && Number(ports[i].portIndex) === Number(portIndex)) {
                ports[i].installedSfp = sfpRef
                    ? { manufacturer: sfpRef.manufacturer, model: sfpRef.model }
                    : null;
                found = true;
                break;
            }
        }
        if (!found) return false;
        oltObj.properties.set('ports', ports);
        updateOltPortCounters(oltObj);
        return true;
    }

    function getOpticalParamsForDevice(device, options) {
        options = options || {};
        if (!device || !device.properties) return null;

        var deviceWavelength = device.properties.get('wavelengthTxNm');
        var sfp = null;

        if (device.properties.get('type') === 'olt') {
            sfp = getOltInstalledSfp(device, options);
        }
        if (!sfp) {
            var ports = device.properties.get('ports') || [];
            for (var i = 0; i < ports.length; i++) {
                if (ports[i] && ports[i].installedSfp) { sfp = ports[i].installedSfp; break; }
            }
        }

        if (sfp) {
            var params = safeGetSfpParams(sfp.manufacturer, sfp.model);
            if (params) {
                return {
                    txPowerDbm: params.txPowerMinDbm,
                    rxSensitivityDbm: params.rxSensitivityDbm,
                    wavelengthNm: deviceWavelength || params.wavelengthNm,
                    source: 'sfp',
                    sfpManufacturer: sfp.manufacturer,
                    sfpModel: sfp.model
                };
            }
        }

        var deviceType = device.properties.get('type');
        var defaultWl = GPON_DEFAULT_WAVELENGTH[deviceType];
        return {
            txPowerDbm: device.properties.get('txPowerDbm') || 3,
            rxSensitivityDbm: device.properties.get('rxSensitivityDbm') || -28,
            wavelengthNm: deviceWavelength || (defaultWl ? defaultWl.tx : 1310),
            source: 'device'
        };
    }

    function calculateSignalAlongPath(pathObjects, options) {
        options = options || {};
        if (!pathObjects || pathObjects.length < 2) return null;

        var steps = [];
        var currentPowerDbm = null;
        var totalLoss = 0;

        var olt = pathObjects[0];
        if (!olt || !olt.properties || olt.properties.get('type') !== 'olt') return null;

        var oltParams = getOpticalParamsForDevice(olt, options);
        currentPowerDbm = oltParams.txPowerDbm;
        var startWavelength = oltParams.wavelengthNm;

        var oltDetails = [
            { label: 'Tx мощность', value: currentPowerDbm.toFixed(2) + ' дБм' },
            { label: 'Длина волны', value: startWavelength + ' нм' }
        ];
        if (oltParams.source === 'sfp') {
            oltDetails.push({
                label: 'SFP',
                value: (oltParams.sfpManufacturer || '') + ' ' + (oltParams.sfpModel || '')
            });
        }

        steps.push({
            step: 0,
            object: olt,
            objectType: 'olt',
            objectName: olt.properties.get('name') || 'OLT',
            loss: 0,
            powerDbm: currentPowerDbm,
            status: 'ok',
            details: oltDetails
        });

        for (var i = 1; i < pathObjects.length; i++) {
            var node = pathObjects[i];
            if (!node || !node.properties) continue;

            var nodeType = node.properties.get('type');
            var nodeName = node.properties.get('name') || nodeType;
            var nodeLoss = 0;
            var nodeDetails = [];

            if (nodeType === 'cable') {
                var lengthKm = cableLengthKm(node);
                var fiberType = node.properties.get('fiberType') || 'smf-28';
                var fiberLoss = calculateFiberLoss(fiberType, startWavelength, lengthKm);
                nodeLoss = fiberLoss;
                var att = (FIBER_ATTENUATION[fiberType] && FIBER_ATTENUATION[fiberType][String(startWavelength)]) || 0.2;
                nodeDetails.push({
                    label: 'Волокно ' + lengthKm.toFixed(3) + ' км × ' + att + ' дБ/км',
                    value: '-' + fiberLoss.toFixed(2) + ' дБ'
                });
            }

            if (nodeType === 'sleeve' || nodeType === 'spliceCassette') {
                var spliceLossSleeve = calculateDeviceSpliceLoss(node);
                nodeLoss = spliceLossSleeve;
                if (spliceLossSleeve > 0) {
                    nodeDetails.push({
                        label: 'Сварки ' + (node.properties.get('spliceCount') || 0),
                        value: '-' + spliceLossSleeve.toFixed(2) + ' дБ'
                    });
                } else {
                    nodeDetails.push({ label: 'Сварки не указаны', value: '0 дБ' });
                }
            }

            if (nodeType === 'cross') {
                var spliceLossCross = calculateDeviceSpliceLoss(node);
                var connectorLoss = calculateCrossConnectorLoss(node);
                nodeLoss = spliceLossCross + connectorLoss;
                if (spliceLossCross > 0) {
                    nodeDetails.push({
                        label: 'Сварки ' + (node.properties.get('spliceCount') || 0),
                        value: '-' + spliceLossCross.toFixed(2) + ' дБ'
                    });
                }
                if (connectorLoss > 0) {
                    nodeDetails.push({
                        label: 'Разъёмы ' + (node.properties.get('connectorCount') || 0),
                        value: '-' + connectorLoss.toFixed(2) + ' дБ'
                    });
                }
            }

            if (nodeType === 'splitter') {
                var ratio = normalizeSplitterRatio(node);
                var losses = SPLITTER_LOSSES[ratio];
                if (losses) {
                    nodeLoss = losses.ideal + losses.excess + losses.uniformity;
                    nodeDetails.push({ label: 'Ideal ' + ratio, value: '-' + losses.ideal.toFixed(2) + ' дБ' });
                    nodeDetails.push({ label: 'Excess', value: '-' + losses.excess.toFixed(2) + ' дБ' });
                    nodeDetails.push({ label: 'Uniformity', value: '-' + losses.uniformity.toFixed(2) + ' дБ' });
                }
            }

            currentPowerDbm -= nodeLoss;
            totalLoss += nodeLoss;

            var status = 'ok';
            if (currentPowerDbm < -27) status = 'fails';
            else if (currentPowerDbm < -20) status = 'marginal';

            steps.push({
                step: i,
                object: node,
                objectType: nodeType,
                objectName: nodeName,
                loss: nodeLoss,
                powerDbm: currentPowerDbm,
                status: status,
                details: nodeDetails
            });
        }

        var onu = pathObjects[pathObjects.length - 1];
        var rxSensitivityDbm = -27;
        var finalMargin = null;

        if (onu && onu.properties && onu.properties.get('type') === 'onu') {
            rxSensitivityDbm = onu.properties.get('rxSensitivityDbm') || -27;
            finalMargin = currentPowerDbm - rxSensitivityDbm;
            var lastStep = steps[steps.length - 1];
            if (lastStep && lastStep.objectType === 'onu') {
                lastStep.rxSensitivityDbm = rxSensitivityDbm;
                lastStep.margin = finalMargin;
                lastStep.status = finalMargin > OPERATIONAL_MARGIN_DB ? 'ok' : (finalMargin > 0 ? 'marginal' : 'fails');
                lastStep.details = [
                    { label: 'Rx мощность', value: currentPowerDbm.toFixed(2) + ' дБм' },
                    { label: 'Rx чувствительность', value: rxSensitivityDbm + ' дБм' },
                    { label: 'Запас', value: finalMargin.toFixed(2) + ' дБ' }
                ];
            } else {
                steps.push({
                    step: pathObjects.length,
                    object: onu,
                    objectType: 'onu',
                    objectName: onu.properties.get('name') || 'ONU',
                    loss: 0,
                    powerDbm: currentPowerDbm,
                    rxSensitivityDbm: rxSensitivityDbm,
                    margin: finalMargin,
                    status: finalMargin > OPERATIONAL_MARGIN_DB ? 'ok' : (finalMargin > 0 ? 'marginal' : 'fails'),
                    details: [
                        { label: 'Rx мощность', value: currentPowerDbm.toFixed(2) + ' дБм' },
                        { label: 'Rx чувствительность', value: rxSensitivityDbm + ' дБм' },
                        { label: 'Запас', value: finalMargin.toFixed(2) + ' дБ' }
                    ]
                });
            }
        }

        var budgetDb = oltParams.txPowerDbm - rxSensitivityDbm;
        var margin = budgetDb - totalLoss;

        return {
            steps: steps,
            totalLoss: totalLoss,
            budgetDb: budgetDb,
            margin: margin,
            verdict: margin > OPERATIONAL_MARGIN_DB ? 'works' : (margin > 0 ? 'marginal' : 'fails'),
            pathLength: pathObjects.length,
            wavelengthNm: startWavelength
        };
    }

    function resolveSplitterFromId(splitterId) {
        if (!splitterId) return null;
        if (typeof resolveSplitterObject === 'function') return resolveSplitterObject(splitterId);
        if (typeof window.resolveSplitterObject === 'function') return window.resolveSplitterObject(splitterId);
        return safeGetObjects().find(function(o) {
            return o.properties &&
                o.properties.get('type') === 'splitter' &&
                safeGetObjectUniqueId(o) === splitterId;
        }) || null;
    }

    function buildPathFromTrace(traceResult) {
        var path = Array.isArray(traceResult) ? traceResult : (traceResult && traceResult.path);
        if (!path || !path.length) return [];
        var seen = new Set();
        var pathObjects = [];
        var lastCableId = null;
        var lastFiberNumber = null;
        var lastHost = null;

        function pushObj(obj) {
            if (!obj || seen.has(obj)) return;
            // Embedded-facade: считаем по uniqueId, чтобы не дублировать.
            var uid = safeGetObjectUniqueId(obj);
            if (uid) {
                for (var si = 0; si < pathObjects.length; si++) {
                    if (safeGetObjectUniqueId(pathObjects[si]) === uid) return;
                }
            }
            seen.add(obj);
            pathObjects.push(obj);
        }

        path.forEach(function(step) {
            if (!step) return;
            if (step.type === 'cable') {
                lastCableId = step.cableId;
                lastFiberNumber = step.fiberNumber;
            }

            if (step.type === 'start' || step.type === 'object') {
                pushObj(step.object);
                if (step.object && step.object.properties) {
                    var t = step.object.properties.get('type');
                    if (t === 'cross' || t === 'sleeve' || t === 'spliceCassette') lastHost = step.object;
                    if (t === 'cable') {
                        lastCableId = step.object.properties.get('uniqueId') || lastCableId;
                    }
                }
            }

            if (step.type === 'cable' && step.cable) pushObj(step.cable);

            if (step.type === 'splitterConnection') {
                pushObj(step.sleeve);
                pushObj(step.splitter);
                if (step.sleeve) lastHost = step.sleeve;
            }

            if (step.type === 'splitterOutputToSplitter') {
                pushObj(step.fromSplitter || step.splitter);
                pushObj(step.toSplitter);
            }

            if (step.type === 'splitterOutputToOnu') {
                pushObj(step.splitter);
                if (step.cable) {
                    pushObj(step.cable);
                } else if (step.onuObj) {
                    var drop = null;
                    if (typeof resolveSplitterToOnuDropFiber === 'function') {
                        drop = resolveSplitterToOnuDropFiber(step.splitter, step.onuObj, null);
                    }
                    if (!drop && step.onuObj.properties) {
                        var incOnu = step.onuObj.properties.get('incomingFiber');
                        if (incOnu && incOnu.cableId) {
                            var dropCab = safeGetObjects().find(function(c) {
                                return c.properties && c.properties.get('type') === 'cable' &&
                                    c.properties.get('uniqueId') === incOnu.cableId;
                            });
                            if (dropCab) drop = { cable: dropCab };
                        }
                    }
                    if (drop && drop.cable) pushObj(drop.cable);
                }
                pushObj(step.onuObj);
            }

            if (step.type === 'splitterOutputToHost') {
                pushObj(step.splitter);
                pushObj(step.host);
                if (step.host) lastHost = step.host;
                if (step.cableId) lastCableId = step.cableId;
                if (step.fiberNumber != null) lastFiberNumber = step.fiberNumber;
            }

            if (step.type === 'splitterOutputToCrossPort') {
                pushObj(step.splitter);
                pushObj(step.cross);
                if (step.cross) lastHost = step.cross;
                if (step.cableId) lastCableId = step.cableId;
                if (step.fiberNumber != null) lastFiberNumber = step.fiberNumber;
            }

            if (step.type === 'splitterOutputToNode') {
                pushObj(step.splitter);
                pushObj(step.nodeObj);
            }

            if (step.type === 'splitterOutputToMediaConverter') {
                pushObj(step.splitter);
                pushObj(step.mediaConverterObj);
            }

            if (step.type === 'onuConnection') {
                pushObj(step.cross || step.sleeve);
                pushObj(step.onu);
            }

            // Fallback: сплиттер на жиле кросса/муфты (в т.ч. embedded).
            var hostCand = step.object || step.sleeve || lastHost;
            if (hostCand && hostCand.properties && lastCableId != null && lastFiberNumber != null) {
                var objType = hostCand.properties.get('type');
                if (objType === 'cross' || objType === 'sleeve' || objType === 'spliceCassette') {
                    var scEntry = null;
                    if (typeof getHostAssignment === 'function') {
                        scEntry = getHostAssignment(hostCand, 'splitterConnections', lastCableId, lastFiberNumber);
                    }
                    if (!scEntry) {
                        var splitterConns = hostCand.properties.get('splitterConnections') || {};
                        scEntry = splitterConns[lastCableId + '-' + lastFiberNumber] || null;
                    }
                    if (scEntry && scEntry.splitterId) {
                        pushObj(resolveSplitterFromId(scEntry.splitterId));
                    } else if (typeof findSplitterOnHostFiber === 'function') {
                        var found = findSplitterOnHostFiber(hostCand, lastCableId, lastFiberNumber, null);
                        if (found && found.splitter) pushObj(found.splitter);
                    }
                }
            }
        });

        return pathObjects;
    }

    function findCableInObjects(cableId) {
        if (!cableId) return null;
        return safeGetObjects().find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' &&
                c.properties.get('uniqueId') === cableId;
        }) || null;
    }

    /**
     * Расчёт дБм по шагам трассировки (учитывает выход сплиттера→порт кросса и drop до ONU).
     */
    function calculateSignalAlongTracePath(tracePath, oltObj, calcOptions) {
        if (!tracePath || !tracePath.length || !oltObj || !oltObj.properties) return null;
        calcOptions = calcOptions || {};

        var oltParams = getOpticalParamsForDevice(oltObj, calcOptions);
        var currentPowerDbm = oltParams.txPowerDbm;
        var startWavelength = oltParams.wavelengthNm;
        var totalLoss = 0;
        var steps = [];
        var stepNum = 0;
        var countedCables = {};
        var countedSplitters = {};
        var oltAdded = false;

        function pushStep(object, objectType, objectName, loss, details) {
            loss = loss || 0;
            currentPowerDbm -= loss;
            totalLoss += loss;
            var status = 'ok';
            if (currentPowerDbm < -27) status = 'fails';
            else if (currentPowerDbm < -20) status = 'marginal';
            steps.push({
                step: stepNum++,
                object: object || null,
                objectType: objectType,
                objectName: objectName || objectType,
                loss: loss,
                powerDbm: currentPowerDbm,
                status: status,
                details: details || []
            });
        }

        function addCableLoss(cable, fiberNumber, labelHint) {
            if (!cable || !cable.properties) return;
            var cid = cable.properties.get('uniqueId');
            var key = cid + ':' + (fiberNumber != null ? fiberNumber : '');
            if (countedCables[key]) return;
            countedCables[key] = true;
            var lengthKm = cableLengthKm(cable);
            var fiberType = cable.properties.get('fiberType') || 'smf-28';
            var fiberLoss = calculateFiberLoss(fiberType, startWavelength, lengthKm);
            var att = (FIBER_ATTENUATION[fiberType] && FIBER_ATTENUATION[fiberType][String(startWavelength)]) || 0.2;
            var name = cable.properties.get('cableName') || labelHint || 'Кабель';
            var stepDetails = [{
                label: 'Волокно ' + lengthKm.toFixed(3) + ' км × ' + att + ' дБ/км',
                value: fiberLoss > 0 ? ('-' + fiberLoss.toFixed(2) + ' дБ') : '0 дБ'
            }];
            pushStep(cable, 'cable', name, fiberLoss, stepDetails);
            if (steps.length) steps[steps.length - 1].lengthKm = lengthKm;
        }

        /** Потери на участке линии связи (кросс/порт → ONU), м. */
        function addDropLinkLoss(distanceM, label, hostObj) {
            var distM = Number(distanceM) || 0;
            if (distM <= 0) return;
            var key = 'link:' + label + ':' + Math.round(distM);
            if (countedCables[key]) return;
            countedCables[key] = true;
            var lengthKm = distM / 1000;
            var fiberType = 'smf-28';
            var fiberLoss = calculateFiberLoss(fiberType, startWavelength, lengthKm);
            var att = (FIBER_ATTENUATION[fiberType] && FIBER_ATTENUATION[fiberType][String(startWavelength)]) || 0.2;
            pushStep(hostObj || null, 'dropLink', label || 'Кросс → ONU', fiberLoss, [{
                label: 'Расстояние ' + Math.round(distM) + ' м (' + lengthKm.toFixed(3) + ' км) × ' + att + ' дБ/км',
                value: fiberLoss > 0 ? ('-' + fiberLoss.toFixed(2) + ' дБ') : '0 дБ'
            }]);
            if (steps.length) steps[steps.length - 1].lengthKm = lengthKm;
        }

        function addSplitterLoss(sp) {
            if (!sp || !sp.properties) return;
            var sid = safeGetObjectUniqueId(sp) || sp;
            if (countedSplitters[sid]) return;
            countedSplitters[sid] = true;
            var ratio = normalizeSplitterRatio(sp);
            var losses = SPLITTER_LOSSES[ratio];
            var loss = losses ? (losses.ideal + losses.excess + losses.uniformity) : 0;
            var details = [];
            if (losses) {
                details.push({ label: 'Ideal ' + ratio, value: '-' + losses.ideal.toFixed(2) + ' дБ' });
                details.push({ label: 'Excess', value: '-' + losses.excess.toFixed(2) + ' дБ' });
                details.push({ label: 'Uniformity', value: '-' + losses.uniformity.toFixed(2) + ' дБ' });
            }
            pushStep(sp, 'splitter', sp.properties.get('name') || 'Сплиттер', loss, details);
        }

        function addCrossPortConnectorLoss(cross, portNumber, explicitLoss) {
            var lossPer = explicitLoss;
            if (lossPer == null || isNaN(lossPer)) {
                if (cross && cross.properties && cross.properties.get('connectorLossDb') != null) {
                    lossPer = Number(cross.properties.get('connectorLossDb'));
                } else {
                    lossPer = CONNECTOR_LOSSES['SC/APC'] || 0.3;
                }
            }
            var name = (cross && cross.properties ? (cross.properties.get('name') || 'Кросс') : 'Кросс');
            if (portNumber != null) name += ' · порт ' + portNumber;
            pushStep(cross, 'cross', name, lossPer, [{
                label: 'Разъём выхода сплиттера',
                value: '-' + Number(lossPer).toFixed(2) + ' дБ'
            }]);
        }

        pushStep(oltObj, 'olt', oltObj.properties.get('name') || 'OLT', 0, [
            { label: 'Tx мощность', value: currentPowerDbm.toFixed(2) + ' дБм' },
            { label: 'Длина волны', value: startWavelength + ' нм' }
        ].concat(oltParams.source === 'sfp' ? [
            { label: 'SFP', value: (oltParams.sfpManufacturer || '') + ' ' + (oltParams.sfpModel || '') }
        ] : []));
        oltAdded = true;

        // Обогатить путь: если есть выход на порт кросса без ONU — достроить drop.
        var enriched = tracePath.slice();
        for (var ei = 0; ei < enriched.length; ei++) {
            var es = enriched[ei];
            if (!es || es.type !== 'splitterOutputToCrossPort') continue;
            var hasOnuAfter = false;
            for (var ej = ei + 1; ej < enriched.length; ej++) {
                var aft = enriched[ej];
                if (aft && ((aft.type === 'object' && aft.objectType === 'onu') || aft.type === 'onuConnection' || aft.type === 'splitterOutputToOnu')) {
                    hasOnuAfter = true;
                    break;
                }
            }
            if (hasOnuAfter) continue;
            if (typeof buildContinuationAfterSplitterCrossPort === 'function' && es.cross) {
                var feederId = es.cableId;
                var feederFn = es.fiberNumber;
                if ((!feederId || feederFn == null) && es.splitter) {
                    if (typeof syncSplitterInputFromHost === 'function') syncSplitterInputFromHost(es.splitter);
                    var inp = es.splitter.properties.get('inputFiber') ||
                        (typeof getSplitterRootInputFiber === 'function' ? getSplitterRootInputFiber(es.splitter) : null);
                    if (inp) {
                        feederId = inp.cableId;
                        feederFn = inp.fiberNumber;
                    }
                }
                var cont = buildContinuationAfterSplitterCrossPort(
                    es.cross, es.crossPort, feederId, feederFn, es.splitter, null
                );
                if (cont && cont.length) {
                    enriched = enriched.slice(0, ei + 1).concat(
                        // сохранить object cross если уже есть следующим
                        (enriched[ei + 1] && enriched[ei + 1].type === 'object' && enriched[ei + 1].objectType === 'cross')
                            ? [enriched[ei + 1]].concat(cont)
                            : cont,
                        enriched.slice(ei + ((enriched[ei + 1] && enriched[ei + 1].type === 'object' && enriched[ei + 1].objectType === 'cross') ? 2 : 1))
                    );
                }
            }
        }

        for (var i = 0; i < enriched.length; i++) {
            var item = enriched[i];
            if (!item) continue;

            if (item.type === 'start' || item.type === 'object') {
                var obj = item.object;
                if (!obj || !obj.properties) continue;
                var t = obj.properties.get('type');
                if (t === 'olt') {
                    if (!oltAdded) {
                        /* already added */
                    }
                    continue;
                }
                if (t === 'cable') {
                    addCableLoss(obj, item.port);
                    continue;
                }
                if (t === 'splitter') {
                    addSplitterLoss(obj);
                    continue;
                }
                if (t === 'cross' || t === 'sleeve' || t === 'spliceCassette') {
                    // Порт выхода сплиттера уже учтён в splitterOutputToCrossPort
                    if (item.signalRole === 'splitter-out-port') continue;
                    var prev = enriched[i - 1];
                    if (prev && prev.type === 'splitterOutputToCrossPort') continue;
                    var hostLoss = 0;
                    var hostDetails = [];
                    var spliceL = calculateDeviceSpliceLoss(obj);
                    var connL = calculateCrossConnectorLoss(obj);
                    hostLoss = spliceL + connL;
                    if (spliceL > 0) hostDetails.push({ label: 'Сварки', value: '-' + spliceL.toFixed(2) + ' дБ' });
                    if (connL > 0) hostDetails.push({ label: 'Разъёмы', value: '-' + connL.toFixed(2) + ' дБ' });
                    if (hostLoss > 0 || t === 'cross') {
                        pushStep(obj, t, obj.properties.get('name') || t, hostLoss, hostDetails);
                    }
                    continue;
                }
                if (t === 'onu') {
                    // финализируем ниже
                    pushStep(obj, 'onu', obj.properties.get('name') || 'ONU', 0, []);
                    continue;
                }
                pushStep(obj, t, obj.properties.get('name') || t, 0, []);
                continue;
            }

            if (item.type === 'cable' && item.cable) {
                addCableLoss(item.cable, item.fiberNumber, item.cableName);
                continue;
            }

            if (item.type === 'splitterConnection' && item.splitter) {
                addSplitterLoss(item.splitter);
                continue;
            }

            if (item.type === 'splitterOutputToCrossPort') {
                addCrossPortConnectorLoss(item.cross, item.crossPort, item.connectorLossDb);
                continue;
            }

            if (item.type === 'splitterOutputToOnu') {
                if (item.splitter) addSplitterLoss(item.splitter);
                if (item.cable) addCableLoss(item.cable, item.fiberNumber);
                else if (item.onuObj && typeof resolveSplitterToOnuDropFiber === 'function') {
                    var drop = resolveSplitterToOnuDropFiber(item.splitter, item.onuObj, null);
                    if (drop && drop.cable) addCableLoss(drop.cable, drop.fiberNumber);
                }
                // Линия связи сплиттер/хост → ONU по routeIds
                if (item.onuObj) {
                    var hostForOnu = (item.splitter && item.splitter._host) || null;
                    var routeIdsOnu = item.routeIds || [];
                    var distOnu = item.distanceM;
                    if (distOnu == null && hostForOnu) {
                        distOnu = measureOnuLinkDistanceM(hostForOnu, item.onuObj, routeIdsOnu);
                    }
                    if (distOnu > 0 && !item.cable) {
                        addDropLinkLoss(distOnu, 'Выход сплиттера → ONU', hostForOnu);
                    }
                }
                continue;
            }

            if (item.type === 'onuConnection' && item.onu) {
                var distLink = item.distanceM != null ? item.distanceM : item.segmentLengthM;
                if (distLink == null) {
                    distLink = measureOnuLinkDistanceM(item.cross, item.onu, item.routeIds || []);
                }
                // Если перед этим уже учтён реальный drop-кабель — не дублируем длину линии,
                // кроме случая когда кабель — feeder (логический), а длина — именно линия связи.
                var prevItem = enriched[i - 1];
                var prevWasDropCable = prevItem && prevItem.type === 'cable' && prevItem.cable &&
                    (function() {
                        var oe = typeof getOtherEndOfCable === 'function'
                            ? getOtherEndOfCable(prevItem.cable, item.cross)
                            : null;
                        return oe && oe.properties && oe.properties.get('type') === 'onu';
                    })();
                if (!prevWasDropCable && distLink > 0) {
                    addDropLinkLoss(distLink, 'Порт кросса → ONU', item.cross);
                }
                continue;
            }
        }

        var last = steps[steps.length - 1];
        var rxSensitivityDbm = -27;
        var finalMargin = null;
        if (last && last.objectType === 'onu') {
            var onuObj = last.object;
            rxSensitivityDbm = (onuObj && onuObj.properties && onuObj.properties.get('rxSensitivityDbm')) || -27;
            finalMargin = currentPowerDbm - rxSensitivityDbm;
            last.rxSensitivityDbm = rxSensitivityDbm;
            last.margin = finalMargin;
            last.status = finalMargin > OPERATIONAL_MARGIN_DB ? 'ok' : (finalMargin > 0 ? 'marginal' : 'fails');
            last.details = [
                { label: 'Rx мощность', value: currentPowerDbm.toFixed(2) + ' дБм' },
                { label: 'Rx чувствительность', value: rxSensitivityDbm + ' дБм' },
                { label: 'Запас', value: finalMargin.toFixed(2) + ' дБ' }
            ];
        }

        var budgetDb = oltParams.txPowerDbm - rxSensitivityDbm;
        var margin = budgetDb - totalLoss;
        return {
            steps: steps,
            totalLoss: totalLoss,
            budgetDb: budgetDb,
            margin: margin,
            verdict: margin > OPERATIONAL_MARGIN_DB ? 'works' : (margin > 0 ? 'marginal' : 'fails'),
            pathLength: steps.length,
            wavelengthNm: startWavelength
        };
    }

    function ensureOltAtPathStart(pathObjects, oltObj) {
        if (!oltObj || !pathObjects || !pathObjects.length) return pathObjects || [];
        if (pathObjects[0] === oltObj) return pathObjects;
        if (pathObjects[0] && pathObjects[0].properties && pathObjects[0].properties.get('type') === 'olt') {
            return pathObjects;
        }
        return [oltObj].concat(pathObjects);
    }

    function pathEndpointLabel(path) {
        if (!path || !path.length) return 'Ветка';
        if (window.FiberTrace && typeof FiberTrace.getPathEndpointLabel === 'function') {
            return FiberTrace.getPathEndpointLabel(path);
        }
        for (var i = path.length - 1; i >= 0; i--) {
            var s = path[i];
            if (s.type === 'object' && s.objectName) return s.objectName;
            if (s.type === 'splitterOutputToOnu' && s.onuName) return s.onuName;
            if (s.type === 'splitterOutputToCrossPort' && s.crossName) {
                return s.crossName + (s.crossPort != null ? (' п.' + s.crossPort) : '');
            }
        }
        return 'Ветка';
    }

    function collectSignalResultsFromOltPort(oltObj, portNumber) {
        var portAssignments = oltObj.properties.get('portAssignments') || {};
        var ass = portAssignments[String(portNumber)];
        if (!ass) return { error: 'На этот порт не назначена жила' };

        var startObj = oltObj;
        if (ass.crossId != null) {
            var cross = safeGetObjects().find(function(o) {
                return o.properties && o.properties.get('type') === 'cross' &&
                    safeGetObjectUniqueId(o) === ass.crossId;
            });
            if (cross) startObj = cross;
        }
        if (typeof resolveOltTraceStartObject === 'function') {
            var resolved = resolveOltTraceStartObject(oltObj, ass.cableId, ass.fiberNumber);
            if (resolved) startObj = resolved;
        }

        var opts = { traceTowardOnu: true };
        if (ass.onuId) opts.targetOnuId = ass.onuId;

        var biasPrev = null;
        if (typeof findOltTraceBiasPrevious === 'function') {
            biasPrev = findOltTraceBiasPrevious(startObj, ass.cableId, ass.fiberNumber, oltObj);
            if (biasPrev) opts.initialPreviousObject = biasPrev;
        }

        var displayPaths = [];
        if (typeof traceAllFiberPathsFromObject === 'function') {
            var all = traceAllFiberPathsFromObject(startObj, ass.cableId, ass.fiberNumber, opts);
            if (all && all.error) return { error: all.error };
            displayPaths = (all && all.paths) ? all.paths.slice() : [];
        } else {
            var traceFn = window.traceFiberPathFromObject || traceFiberPathFromObject;
            if (typeof traceFn !== 'function') return { error: 'Функция трассировки недоступна' };
            var one = traceFn(startObj, ass.cableId, ass.fiberNumber, opts);
            if (one && one.error) return { error: one.error };
            if (one && one.path && one.path.length) displayPaths = [one.path];
        }

        if (typeof prependOltPrefixToPath === 'function') {
            displayPaths = displayPaths.map(function(p) {
                return prependOltPrefixToPath(p, oltObj, portNumber, startObj, ass.cableId, ass.fiberNumber);
            });
        }

        if (!displayPaths.length) return { error: 'Не удалось построить трассу' };

        var branches = [];
        displayPaths.forEach(function(path, idx) {
            var result = calculateSignalAlongTracePath(path, oltObj, { portNumber: portNumber });
            if (!result) {
                var pathObjects = ensureOltAtPathStart(buildPathFromTrace(path), oltObj);
                result = calculateSignalAlongPath(pathObjects, { portNumber: portNumber });
            }
            if (!result) return;
            result.branchIndex = idx;
            result.branchLabel = pathEndpointLabel(path);
            result.sourcePath = path;
            branches.push(result);
        });

        if (!branches.length) return { error: 'Не удалось рассчитать уровень сигнала' };
        return { branches: branches };
    }

    function openSignalLevelFromOltPort(oltObj, portNumber) {
        if (!oltObj || !oltObj.properties) return;
        var packed = collectSignalResultsFromOltPort(oltObj, portNumber);
        if (packed.error) {
            safeShowWarning(packed.error, 'Уровень сигнала');
            return;
        }
        openSignalTraceModal(packed.branches[0], packed.branches);
    }

    function openSignalLevelFromUplinkPort(oltObj, portIndex) {
        if (!oltObj || !oltObj.properties) return;
        var ports = oltObj.properties.get('ports') || [];
        var port = null;
        for (var i = 0; i < ports.length; i++) {
            if (ports[i].portIndex === portIndex) { port = ports[i]; break; }
        }
        if (!port || !port.connectedCableId) {
            safeShowWarning('На этот порт не подключён кабель', 'Данные устарели');
            return;
        }

        var objs = safeGetObjects();
        var cable = null;
        for (var j = 0; j < objs.length; j++) {
            var o = objs[j];
            if (o.properties && o.properties.get('type') === 'cable' &&
                o.properties.get('uniqueId') === port.connectedCableId) {
                cable = o;
                break;
            }
        }
        if (!cable) {
            safeShowWarning('Кабель не найден', 'Ошибка');
            return;
        }
        if (port.portType === 'rj45' ||
            (typeof isCopperCableType === 'function' && isCopperCableType(cable.properties.get('cableType')))) {
            safeShowWarning('Расчёт уровня сигнала доступен только для оптического кабеля, не для медного.', 'Медный кабель');
            return;
        }

        var pathObjects = [oltObj, cable];
        var getOther = window.getOtherEndOfCable || (typeof getOtherEndOfCable === 'function' ? getOtherEndOfCable : null);
        if (typeof getOther === 'function') {
            var otherEnd = getOther(cable, oltObj);
            if (otherEnd) pathObjects.push(otherEnd);
        }

        var result = calculateSignalAlongPath(pathObjects, { portIndex: portIndex });
        openSignalTraceModal(result);
    }

    var _signalBranches = null;

    function openSignalTraceModal(result, branches) {
        if (!result) {
            safeShowWarning('Не удалось рассчитать уровень сигнала', 'Ошибка');
            return;
        }

        var modal = document.getElementById('signalTraceModal');
        if (!modal) {
            console.error('[Signal] signalTraceModal не найден');
            return;
        }

        _signalBranches = (branches && branches.length) ? branches : [result];
        renderSignalTraceBody(result, _signalBranches);

        var closeBtn = modal.querySelector('.close-signal-trace');
        if (closeBtn && !closeBtn._bound) {
            closeBtn._bound = true;
            closeBtn.addEventListener('click', closeSignalTraceModal);
        }
        var closeBtn2 = document.getElementById('closeSignalTraceBtn');
        if (closeBtn2 && !closeBtn2._bound) {
            closeBtn2._bound = true;
            closeBtn2.addEventListener('click', closeSignalTraceModal);
        }
        var exportBtn = document.getElementById('exportSignalTraceBtn');
        if (exportBtn && !exportBtn._bound) {
            exportBtn._bound = true;
            exportBtn.addEventListener('click', function() {
                var active = _signalBranches && _signalBranches[_signalActiveBranch];
                exportSignalTraceToTxt(active || result);
            });
        }

        modal.style.display = 'block';
        highlightSignalPath(result);
    }

    var _signalActiveBranch = 0;

    function selectSignalTraceBranch(idx) {
        if (!_signalBranches || !_signalBranches[idx]) return;
        renderSignalTraceBody(_signalBranches[idx], _signalBranches);
        highlightSignalPath(_signalBranches[idx]);
    }

    function renderSignalTraceBody(activeResult, branches) {
        var body = document.getElementById('signalTraceBody');
        if (!body) return;
        var hasBranches = !!(branches && branches.length > 1);
        var activeIdx = activeResult.branchIndex || 0;
        var html = '';

        if (hasBranches) {
            html += '<div class="signal-trace-layout signal-trace-layout--split">';
            html += '<aside class="signal-trace-side" aria-label="Список веток">';
            html += '<div class="signal-trace-side-head">';
            html += '<span class="signal-trace-side-title">Ветки</span>';
            html += '<span class="signal-trace-side-count">' + branches.length + '</span>';
            html += '</div>';
            html += '<div class="signal-trace-side-nav">';
            html += '<button type="button" class="signal-trace-nav-btn" id="signalTracePrevBranch" title="Предыдущая ветка" aria-label="Предыдущая ветка"' +
                (activeIdx <= 0 ? ' disabled' : '') + '>&larr;</button>';
            html += '<span class="signal-trace-side-pos">' + (activeIdx + 1) + ' / ' + branches.length + '</span>';
            html += '<button type="button" class="signal-trace-nav-btn" id="signalTraceNextBranch" title="Следующая ветка" aria-label="Следующая ветка"' +
                (activeIdx >= branches.length - 1 ? ' disabled' : '') + '>&rarr;</button>';
            html += '</div>';
            html += '<div class="signal-trace-side-list" role="listbox" aria-label="Ветки трассы">';
            branches.forEach(function(br, idx) {
                var active = idx === activeIdx;
                var brVerdict = signalTraceStatusMeta(br.verdict);
                var fullLabel = String(br.branchLabel || ('Ветка ' + (idx + 1))).trim();
                var power = (br.steps && br.steps.length) ? br.steps[br.steps.length - 1].powerDbm : null;
                var powerTxt = (power != null && !isNaN(Number(power))) ? Number(power).toFixed(1) + ' дБм' : '';
                html += '<button type="button" role="option" aria-selected="' + (active ? 'true' : 'false') +
                    '" title="' + safeEscapeHtml(fullLabel) + '"' +
                    ' class="signal-trace-side-item signal-trace-side-item--' + brVerdict.key +
                    (active ? ' is-active' : '') +
                    '" data-branch-index="' + idx + '">' +
                    '<span class="signal-trace-side-item-dot" aria-hidden="true"></span>' +
                    '<span class="signal-trace-side-item-body">' +
                    '<span class="signal-trace-side-item-name">' +
                    '<span class="signal-trace-side-item-num">' + (idx + 1) + '.</span> ' +
                    safeEscapeHtml(fullLabel) +
                    '</span>';
                if (powerTxt) {
                    html += '<span class="signal-trace-side-item-meta">' + safeEscapeHtml(powerTxt) + '</span>';
                }
                html += '</span></button>';
            });
            html += '</div></aside>';
            html += '<div class="signal-trace-main">';
            html += buildSignalTraceHtml(activeResult);
            html += '</div></div>';
        } else {
            html += buildSignalTraceHtml(activeResult);
        }

        body.innerHTML = html;
        _signalActiveBranch = activeIdx;

        body.querySelectorAll('.signal-trace-side-item').forEach(function(btn) {
            btn.addEventListener('click', function() {
                selectSignalTraceBranch(parseInt(this.getAttribute('data-branch-index'), 10));
            });
        });
        var prevBtn = document.getElementById('signalTracePrevBranch');
        var nextBtn = document.getElementById('signalTraceNextBranch');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (activeIdx > 0) selectSignalTraceBranch(activeIdx - 1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (activeIdx < branches.length - 1) selectSignalTraceBranch(activeIdx + 1);
            });
        }
        var activeItem = body.querySelector('.signal-trace-side-item.is-active');
        if (activeItem && typeof activeItem.scrollIntoView === 'function') {
            try { activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        }
    }

    function closeSignalTraceModal() {
        var modal = document.getElementById('signalTraceModal');
        if (modal) modal.style.display = 'none';
        clearSignalHighlight();
        _signalBranches = null;
        _signalActiveBranch = 0;
    }

    function signalTraceStatusMeta(status) {
        if (status === 'ok' || status === 'works') {
            return { key: 'ok', label: 'Норма' };
        }
        if (status === 'marginal') {
            return { key: 'marginal', label: 'На грани' };
        }
        return { key: 'fails', label: 'Недостаточен' };
    }

    function signalTraceObjectTypeLabel(type) {
        var map = {
            olt: 'OLT',
            cable: 'Кабель',
            splitter: 'Сплиттер',
            onu: 'ONU',
            cross: 'Кросс',
            sleeve: 'Муфта',
            spliceCassette: 'Кассета',
            mediaConverter: 'МК',
            connector: 'Разъём',
            drop: 'Отвод',
            host: 'Узел'
        };
        return map[type] || (type ? String(type) : 'Узел');
    }

    function formatSignalPower(v) {
        if (v == null || isNaN(Number(v))) return '—';
        var n = Number(v);
        return (n >= 0 ? '+' : '') + n.toFixed(2) + ' дБм';
    }

    function formatSignalLoss(v) {
        if (v == null || isNaN(Number(v)) || Number(v) <= 0) return null;
        return '−' + Number(v).toFixed(2) + ' дБ';
    }

    function formatSignalKm(v) {
        if (v == null || isNaN(Number(v))) return '0';
        var n = Number(v);
        if (n < 0.01) return (n * 1000).toFixed(0) + ' м';
        return n.toFixed(2) + ' км';
    }

    function calcSignalTraceLengthKm(result) {
        var totalLength = 0;
        (result.steps || []).forEach(function(s) {
            if (s.lengthKm != null && !isNaN(s.lengthKm)) {
                totalLength += Number(s.lengthKm);
            } else if (s.objectType === 'cable' && s.object) {
                totalLength += cableLengthKm(s.object);
            }
        });
        return totalLength;
    }

    function buildSignalTraceHtml(result) {
        var steps = result.steps || [];
        var verdict = signalTraceStatusMeta(result.verdict);
        var lastStep = steps.length ? steps[steps.length - 1] : null;
        var finalPower = lastStep ? lastStep.powerDbm : null;
        var firstStep = steps.length ? steps[0] : null;
        var startPower = firstStep && firstStep.loss === 0
            ? firstStep.powerDbm
            : (finalPower != null && result.totalLoss != null ? finalPower + result.totalLoss : null);
        var totalLength = calcSignalTraceLengthKm(result);
        var html = '';

        html += '<div class="signal-trace">';

        html += '<section class="signal-trace-verdict signal-trace-verdict--' + verdict.key + '" aria-label="Итог расчёта">';
        html += '<div class="signal-trace-verdict-top">';
        html += '<span class="signal-trace-verdict-badge">' + safeEscapeHtml(verdict.label) + '</span>';
        html += '<span class="signal-trace-verdict-hint">';
        if (result.verdict === 'works') html += 'Запас достаточный для стабильной работы';
        else if (result.verdict === 'marginal') html += 'Запас мал — возможен нестабильный приём';
        else html += 'Сигнал ниже чувствительности приёмника';
        html += '</span></div>';
        html += '<div class="signal-trace-verdict-main">';
        html += '<div class="signal-trace-verdict-power">';
        html += '<span class="signal-trace-verdict-kicker">Сигнал на приёме</span>';
        html += '<span class="signal-trace-verdict-value">' + safeEscapeHtml(formatSignalPower(finalPower)) + '</span>';
        html += '</div>';
        html += '<div class="signal-trace-verdict-grid">';
        html += '<div class="signal-trace-metric"><span class="signal-trace-metric-label">Запас</span><span class="signal-trace-metric-value">' +
            (result.margin != null && !isNaN(Number(result.margin)) ? Number(result.margin).toFixed(2) + ' дБ' : '—') + '</span></div>';
        html += '<div class="signal-trace-metric"><span class="signal-trace-metric-label">Потери</span><span class="signal-trace-metric-value">' +
            (result.totalLoss != null ? result.totalLoss.toFixed(2) + ' дБ' : '—') + '</span></div>';
        html += '<div class="signal-trace-metric"><span class="signal-trace-metric-label">Бюджет</span><span class="signal-trace-metric-value">' +
            (result.budgetDb != null ? result.budgetDb.toFixed(2) + ' дБ' : '—') + '</span></div>';
        if (startPower != null) {
            html += '<div class="signal-trace-metric"><span class="signal-trace-metric-label">Tx на старте</span><span class="signal-trace-metric-value">' +
                safeEscapeHtml(formatSignalPower(startPower)) + '</span></div>';
        }
        html += '</div></div>';
        html += '</section>';

        html += '<div class="signal-trace-meta" role="list">';
        html += '<span class="signal-trace-chip" role="listitem"><span class="signal-trace-chip-label">Направление</span><span class="signal-trace-chip-value">downstream</span></span>';
        html += '<span class="signal-trace-chip" role="listitem"><span class="signal-trace-chip-label">Длина волны</span><span class="signal-trace-chip-value">' +
            safeEscapeHtml(String(result.wavelengthNm || '—')) + ' нм</span></span>';
        html += '<span class="signal-trace-chip" role="listitem"><span class="signal-trace-chip-label">Шагов</span><span class="signal-trace-chip-value">' +
            steps.length + '</span></span>';
        html += '<span class="signal-trace-chip" role="listitem"><span class="signal-trace-chip-label">Длина</span><span class="signal-trace-chip-value">' +
            safeEscapeHtml(formatSignalKm(totalLength)) + '</span></span>';
        html += '</div>';

        if (!steps.length) {
            html += '<p class="signal-trace-empty">Нет шагов для отображения трассы.</p>';
            html += '</div>';
            return html;
        }

        html += '<div class="signal-trace-timeline-head">';
        html += '<h3 class="signal-trace-timeline-title">Ход сигнала</h3>';
        html += '<p class="signal-trace-timeline-note">Сверху вниз: от источника к приёмнику. Потери вычитаются на каждом шаге.</p>';
        html += '</div>';

        html += '<ol class="signal-trace-timeline">';
        steps.forEach(function(step, idx) {
            var st = signalTraceStatusMeta(step.status);
            var lossTxt = formatSignalLoss(step.loss);
            var isLast = idx === steps.length - 1;
            html += '<li class="signal-trace-step signal-trace-step--' + st.key + (isLast ? ' signal-trace-step--last' : '') + '">';
            html += '<div class="signal-trace-step-rail" aria-hidden="true">';
            html += '<span class="signal-trace-step-dot"></span>';
            if (!isLast) html += '<span class="signal-trace-step-line"></span>';
            html += '</div>';
            html += '<div class="signal-trace-step-card">';
            html += '<div class="signal-trace-step-top">';
            html += '<div class="signal-trace-step-identity">';
            html += '<span class="signal-trace-step-index">' + (step.step != null ? step.step : (idx + 1)) + '</span>';
            html += '<span class="signal-trace-step-type">' + safeEscapeHtml(signalTraceObjectTypeLabel(step.objectType)) + '</span>';
            html += '<span class="signal-trace-step-name">' + safeEscapeHtml(step.objectName || '—') + '</span>';
            html += '</div>';
            html += '<span class="signal-trace-step-status">' + safeEscapeHtml(st.label) + '</span>';
            html += '</div>';
            html += '<div class="signal-trace-step-power">';
            html += '<div class="signal-trace-step-power-main">';
            html += '<span class="signal-trace-step-power-label">Уровень</span>';
            html += '<strong class="signal-trace-step-power-value">' + safeEscapeHtml(formatSignalPower(step.powerDbm)) + '</strong>';
            html += '</div>';
            if (lossTxt) {
                html += '<div class="signal-trace-step-loss" title="Потери на этом шаге">';
                html += '<span class="signal-trace-step-loss-label">Потери</span>';
                html += '<span class="signal-trace-step-loss-value">' + safeEscapeHtml(lossTxt) + '</span>';
                html += '</div>';
            } else {
                html += '<div class="signal-trace-step-loss signal-trace-step-loss--none">';
                html += '<span class="signal-trace-step-loss-label">Потери</span>';
                html += '<span class="signal-trace-step-loss-value">нет</span>';
                html += '</div>';
            }
            html += '</div>';
            if (step.details && step.details.length) {
                html += '<dl class="signal-trace-step-details">';
                step.details.forEach(function(d) {
                    html += '<div class="signal-trace-step-detail">';
                    html += '<dt>' + safeEscapeHtml(d.label) + '</dt>';
                    html += '<dd>' + safeEscapeHtml(d.value) + '</dd>';
                    html += '</div>';
                });
                html += '</dl>';
            }
            html += '</div></li>';
        });
        html += '</ol>';

        html += '<div class="signal-trace-legend" aria-label="Легенда статусов">';
        html += '<span class="signal-trace-legend-item signal-trace-legend-item--ok"><i></i>Норма</span>';
        html += '<span class="signal-trace-legend-item signal-trace-legend-item--marginal"><i></i>На грани</span>';
        html += '<span class="signal-trace-legend-item signal-trace-legend-item--fails"><i></i>Недостаточен</span>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    var _signalHighlightState = null;

    function highlightSignalPath(result) {
        clearSignalHighlight();
        var highlighted = [];

        result.steps.forEach(function(step) {
            if (!step.object || !step.object.options) return;
            var color = step.status === 'ok' ? '#22c55e' :
                       (step.status === 'marginal' ? '#eab308' : '#ef4444');

            try {
                if (step.objectType === 'cable') {
                    var origStroke = step.object.options.get('strokeColor');
                    var origWidth = step.object.options.get('strokeWidth');
                    step.object.options.set('strokeColor', color);
                    step.object.options.set('strokeWidth', 5);
                    highlighted.push({ obj: step.object, orig: { strokeColor: origStroke, strokeWidth: origWidth || 3 } });
                }
            } catch (e) {}
        });

        _signalHighlightState = highlighted;
    }

    function clearSignalHighlight() {
        if (!_signalHighlightState) return;
        _signalHighlightState.forEach(function(item) {
            try {
                if (item.obj.options) {
                    item.obj.options.set('strokeColor', item.orig.strokeColor);
                    item.obj.options.set('strokeWidth', item.orig.strokeWidth);
                }
            } catch (e) {}
        });
        _signalHighlightState = null;
    }

    function exportSignalTraceToTxt(result) {
        var text = 'УРОВЕНЬ СИГНАЛА НА ТРАССЕ\n\n';
        text += 'Направление: downstream (' + result.wavelengthNm + ' нм)\n\n';

        result.steps.forEach(function(step) {
            text += step.step + '. ' + step.objectName + '\n';
            text += '   Потери: ' + (step.loss > 0 ? '-' + step.loss.toFixed(2) : '0') + ' дБ\n';
            text += '   Сигнал: ' + step.powerDbm.toFixed(2) + ' дБм\n';
            text += '   Статус: ' + step.status + '\n\n';
        });

        text += 'ИТОГО:\n';
        text += 'Потери: ' + result.totalLoss.toFixed(2) + ' дБ\n';
        text += 'Бюджет: ' + result.budgetDb.toFixed(2) + ' дБ\n';
        text += 'Запас: ' + result.margin.toFixed(2) + ' дБ\n';

        var blob = new Blob([text], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'signal-level-' + new Date().toISOString().split('T')[0] + '.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    var _oltPortSelectionOnCancel = null;

    function findFreeOltPorts(oltObj) {
        if (!oltObj || !oltObj.properties) return [];
        var ports = oltObj.properties.get('ports') || [];
        var free = [];
        for (var i = 0; i < ports.length; i++) {
            var p = ports[i];
            if ((p.portType === 'sfp-uplink' || p.portType === 'sfp-plus-uplink' || p.portType === 'rj45')
                && !p.connectedCableId && p.connectedFiberNumber == null) {
                free.push(p);
            }
        }
        return free;
    }

    function findOltPortByCableId(oltObj, cableUniqueId) {
        if (!oltObj || !oltObj.properties) return null;
        var ports = oltObj.properties.get('ports') || [];
        for (var i = 0; i < ports.length; i++) {
            if (ports[i].connectedCableId === cableUniqueId) return ports[i];
        }
        return null;
    }

    function findOltByCableId(cableUniqueId) {
        if (!cableUniqueId) return null;
        var objs = safeGetObjects();
        for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (!o.properties || o.properties.get('type') !== 'olt') continue;
            var ports = o.properties.get('ports') || [];
            for (var j = 0; j < ports.length; j++) {
                if (ports[j].connectedCableId === cableUniqueId) return o;
            }
        }
        return null;
    }

    function cableAssignedToOltPon(oltObj, cableUniqueId) {
        if (!oltObj || !oltObj.properties || !cableUniqueId) return false;
        var pa = oltObj.properties.get('portAssignments') || {};
        for (var k in pa) {
            if (pa[k] && pa[k].cableId === cableUniqueId) return true;
        }
        var inc = oltObj.properties.get('incomingFiber');
        if (inc && inc.cableId === cableUniqueId) return true;
        return false;
    }

    function openOltPortSelectionModal(oltObj, cableUniqueId, onSuccess, onCancel) {
        var modal = document.getElementById('oltPortSelectionModal');
        if (!modal) return;
        if (!oltObj || !oltObj.properties) return;

        var freePorts = findFreeOltPorts(oltObj);
        var info = document.getElementById('oltPortSelectionInfo');
        var body = document.getElementById('oltPortSelectionBody');

        if (info) {
            info.textContent = 'Выберите uplink-порт для подключения кабеля к OLT "' +
                (oltObj.properties.get('name') || 'OLT') + '":';
        }

        if (!body) return;

        if (freePorts.length === 0) {
            // Не блокируем PON-кабели: просто не открываем модалку.
            if (typeof onCancel === 'function') onCancel(false);
            return;
        }

        var html = '<div class="olt-ports-table-wrap"><table class="node-ports-table olt-ports-table">';
        html += '<thead><tr>';
        html += '<th scope="col">№</th><th scope="col">Тип</th><th scope="col">Метка</th><th scope="col">Скорость</th>';
        html += '<th scope="col" class="node-ports-table-actions"></th></tr></thead><tbody>';

        freePorts.forEach(function(port) {
            var typeLabel = (typeof getOltPortTypeLabel === 'function')
                ? getOltPortTypeLabel(port.portType)
                : port.portType;
            html += '<tr class="olt-port-row olt-port-row--free">';
            html += '<td class="olt-ports-table-port">' + port.portIndex + '</td>';
            html += '<td><span class="olt-port-type-pill">' + safeEscapeHtml(typeLabel) + '</span></td>';
            html += '<td class="olt-ports-table-label">' + safeEscapeHtml(port.portLabel || '—') + '</td>';
            html += '<td>' + safeEscapeHtml(port.speed || '—') + '</td>';
            html += '<td class="node-ports-table-actions"><div class="olt-port-actions">';
            html += '<button type="button" class="btn-olt-port-cable btn-select-olt-port" data-port-index="' +
                    port.portIndex + '">Выбрать</button>';
            html += '</div></td></tr>';
        });
        html += '</tbody></table></div>';
        body.innerHTML = html;

        body.querySelectorAll('.btn-select-olt-port').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var portIndex = parseInt(this.getAttribute('data-port-index'), 10);
                var success = assignCableToOltPortByIndex(oltObj, portIndex, cableUniqueId);
                if (success) {
                    modal.style.display = 'none';
                    _oltPortSelectionOnCancel = null;
                    if (typeof onSuccess === 'function') onSuccess(portIndex);
                }
            });
        });

        var cancelBtn = document.getElementById('cancelOltPortSelection');
        if (cancelBtn && !cancelBtn._bound) {
            cancelBtn._bound = true;
            cancelBtn.addEventListener('click', closeOltPortSelectionModal);
        }
        var closeX = modal.querySelector('.close-olt-port-selection');
        if (closeX && !closeX._bound) {
            closeX._bound = true;
            closeX.addEventListener('click', closeOltPortSelectionModal);
        }

        _oltPortSelectionOnCancel = onCancel;
        modal.style.display = 'block';
    }

    function closeOltPortSelectionModal() {
        var modal = document.getElementById('oltPortSelectionModal');
        if (!modal) return;
        modal.style.display = 'none';
        var cb = _oltPortSelectionOnCancel;
        _oltPortSelectionOnCancel = null;
        if (typeof cb === 'function') cb(true);
    }

    function assignCableToOltPortByIndex(oltObj, portIndex, cableUniqueId) {
        if (!oltObj || !oltObj.properties) return false;
        var ports = oltObj.properties.get('ports') || [];
        var port = null;
        for (var i = 0; i < ports.length; i++) {
            if (ports[i].portIndex === portIndex) { port = ports[i]; break; }
        }

        if (!port) {
            safeShowWarning('Порт ' + portIndex + ' не найден', 'Ошибка');
            return false;
        }
        if (port.connectedCableId && port.connectedCableId !== cableUniqueId) {
            safeShowWarning('Порт ' + port.portLabel + ' уже занят', 'Порт занят');
            return false;
        }

        var existingPort = findOltPortByCableId(oltObj, cableUniqueId);
        if (existingPort && existingPort.portIndex !== portIndex) {
            safeShowWarning('Кабель уже подключён к порту ' + existingPort.portLabel, 'Кабель занят');
            return false;
        }

        port.connectedCableId = cableUniqueId;
        port.status = 'up';
        oltObj.properties.set('ports', ports);

        updateOltPortCounters(oltObj);
        safeSyncPush(oltObj);
        if (typeof saveData === 'function') saveData();
        safeAddHistory({
            action: 'assign_cable_to_olt_port',
            olt: oltObj.properties.get('name') || 'OLT',
            port: port.portLabel,
            cable: cableUniqueId
        });
        return true;
    }

    function releaseCableFromOltPort(oltObj, cableUniqueId) {
        if (!oltObj || !oltObj.properties) return;
        var port = findOltPortByCableId(oltObj, cableUniqueId);
        if (!port) return;

        var ports = oltObj.properties.get('ports') || [];
        port.connectedCableId = null;
        port.status = 'down';
        oltObj.properties.set('ports', ports);
        updateOltPortCounters(oltObj);
        safeSyncPush(oltObj);
        safeAddHistory({
            action: 'release_cable_from_olt_port',
            olt: oltObj.properties.get('name') || 'OLT',
            port: port.portLabel
        });
    }

    function updateOltPortCounters(oltObj) {
        if (!oltObj || !oltObj.properties) return;
        var ports = oltObj.properties.get('ports') || [];
        var counters = { ponPortsCount: 0, uplinkSfpPortsCount: 0, uplinkSfpPlusPortsCount: 0,
            rj45PortsCount: 0, syncPortsCount: 0, consolePortsCount: 0,
            sfpInstalledCount: 0, uplinkPortsUsed: 0 };

        for (var i = 0; i < ports.length; i++) {
            var p = ports[i];
            if (!p) continue;
            if (p.portType === 'pon') counters.ponPortsCount++;
            if (p.portType === 'sfp-uplink') counters.uplinkSfpPortsCount++;
            if (p.portType === 'sfp-plus-uplink') counters.uplinkSfpPlusPortsCount++;
            if (p.portType === 'rj45') counters.rj45PortsCount++;
            if (p.portType === 'sync') counters.syncPortsCount++;
            if (p.portType === 'console') counters.consolePortsCount++;
            if (p.installedSfp) counters.sfpInstalledCount++;
            if ((p.portType === 'sfp-uplink' || p.portType === 'sfp-plus-uplink' || p.portType === 'rj45')
                && p.connectedCableId) counters.uplinkPortsUsed++;
        }

        Object.keys(counters).forEach(function(key) {
            oltObj.properties.set(key, counters[key]);
        });
        oltObj.properties.set('uplinkPortsTotal',
            counters.uplinkSfpPortsCount + counters.uplinkSfpPlusPortsCount);
    }

    /** Фиксированные базы индексов — независимы друг от друга. */
    var OLT_PORT_TYPE_DEFS = [
        { type: 'pon', label: 'PON', counterKey: 'ponPorts', indexBase: 0, max: 64, speed: '2.5G',
          labelPrefix: 'GPON 0/1/', status: 'up' },
        { type: 'sfp-uplink', label: 'SFP uplink (1G)', counterKey: 'uplinkSfpPortsCount',
          indexBase: 100, max: 16, speed: '1G', labelPrefix: 'Uplink SFP 0/0/', status: 'down' },
        { type: 'sfp-plus-uplink', label: 'SFP+ uplink (10G)', counterKey: 'uplinkSfpPlusPortsCount',
          indexBase: 120, max: 16, speed: '10G', labelPrefix: 'Uplink SFP+ 0/0/', status: 'down' },
        { type: 'rj45', label: 'RJ45 (GE)', counterKey: 'rj45PortsCount',
          indexBase: 200, max: 16, speed: '1G', labelPrefix: 'GE 0/0/', status: 'down' },
        { type: 'console', label: 'Console', counterKey: 'consolePortsCount',
          indexBase: 300, max: 1, speed: null, labelPrefix: 'Console', status: 'unknown', fixedLabel: 'Console' },
        { type: 'sync', label: 'Sync / BITS', counterKey: 'syncPortsCount',
          indexBase: 400, max: 1, speed: null, labelPrefix: 'BITS', status: 'unknown', fixedLabel: 'BITS' }
    ];

    function getOltPortTypeDef(portType) {
        for (var i = 0; i < OLT_PORT_TYPE_DEFS.length; i++) {
            if (OLT_PORT_TYPE_DEFS[i].type === portType) return OLT_PORT_TYPE_DEFS[i];
        }
        return null;
    }

    function getOltExtraPortTypeDefs() {
        return OLT_PORT_TYPE_DEFS.filter(function(d) { return d.type !== 'pon'; });
    }

    function countOltPortsOfType(oltObj, portType) {
        if (!oltObj || !oltObj.properties) return 0;
        if (portType === 'pon') {
            return Math.max(1, parseInt(oltObj.properties.get('ponPorts'), 10) || 8);
        }
        var def = getOltPortTypeDef(portType);
        if (!def) return 0;
        var fromCounter = parseInt(oltObj.properties.get(def.counterKey), 10);
        if (!isNaN(fromCounter) && fromCounter >= 0) return fromCounter;
        var ports = oltObj.properties.get('ports') || [];
        var n = 0;
        for (var i = 0; i < ports.length; i++) {
            if (ports[i] && ports[i].portType === portType) n++;
        }
        return n;
    }

    function collectExistingPortsByType(existingPorts) {
        var byType = {};
        (existingPorts || []).forEach(function(p) {
            if (!p || !p.portType) return;
            if (!byType[p.portType]) byType[p.portType] = [];
            byType[p.portType].push(p);
        });
        Object.keys(byType).forEach(function(t) {
            byType[t].sort(function(a, b) {
                return (a.portIndex || 0) - (b.portIndex || 0);
            });
        });
        return byType;
    }

    function buildOltPorts(oltObj) {
        if (!oltObj || !oltObj.properties) return;
        var existingPorts = oltObj.properties.get('ports') || [];
        var byType = collectExistingPortsByType(existingPorts);
        var ports = [];

        var ponCount = Math.max(1, parseInt(oltObj.properties.get('ponPorts'), 10) ||
            parseInt(oltObj.properties.get('ponPortsCount'), 10) || 8);
        oltObj.properties.set('ponPorts', ponCount);
        var ponExisting = byType.pon || [];
        for (var pi = 0; pi < ponCount; pi++) {
            ports.push(mergeExistingPort({
                portIndex: pi,
                portType: 'pon',
                portLabel: 'GPON 0/1/' + pi,
                speed: '2.5G',
                installedSfp: null,
                connectedCableId: null,
                connectedFiberNumber: null,
                status: 'up'
            }, ponExisting[pi] || null));
        }

        getOltExtraPortTypeDefs().forEach(function(def) {
            var count = Math.max(0, parseInt(oltObj.properties.get(def.counterKey), 10) || 0);
            if (count > def.max) count = def.max;
            oltObj.properties.set(def.counterKey, count);
            var existingOfType = byType[def.type] || [];
            for (var i = 0; i < count; i++) {
                var label = def.fixedLabel || (def.labelPrefix + i);
                ports.push(mergeExistingPort({
                    portIndex: def.indexBase + i,
                    portType: def.type,
                    portLabel: label,
                    speed: def.speed,
                    installedSfp: null,
                    connectedCableId: null,
                    status: def.status || 'down'
                }, existingOfType[i] || null));
            }
        });

        oltObj.properties.set('ports', ports);
        updateOltPortCounters(oltObj);
    }

    function mergeExistingPort(newPort, existingPort) {
        if (!existingPort) return newPort;
        newPort.connectedCableId = existingPort.connectedCableId || null;
        newPort.connectedFiberNumber = existingPort.connectedFiberNumber || null;
        newPort.installedSfp = existingPort.installedSfp || null;
        newPort.status = existingPort.status || newPort.status;
        if (existingPort.portLabel) newPort.portLabel = existingPort.portLabel;
        return newPort;
    }

    function setOltPonPortCount(oltObj, newCount) {
        if (!oltObj || !oltObj.properties) return false;
        newCount = parseInt(newCount, 10);
        if (isNaN(newCount)) return false;
        newCount = Math.max(1, Math.min(64, newCount));
        var assignments = oltObj.properties.get('portAssignments') || {};
        var maxUsed = 0;
        Object.keys(assignments).forEach(function(k) {
            var n = parseInt(k, 10);
            if (isNaN(n) || n < 1) return;
            var inUse = typeof isOltPortInUse === 'function'
                ? isOltPortInUse(oltObj, n)
                : !!assignments[k];
            if (inUse && n > maxUsed) maxUsed = n;
        });
        if (newCount < maxUsed) {
            safeShowWarning('PON-порт ' + maxUsed + ' занят. Уменьшить число портов нельзя.', 'PON-порты');
            return false;
        }
        oltObj.properties.set('ponPorts', newCount);
        oltObj.properties.set('ponPortsCount', newCount);
        if (typeof getOltPonPortTypes === 'function') {
            oltObj.properties.set('ponPortTypes', getOltPonPortTypes(oltObj));
        }
        buildOltPorts(oltObj);
        return true;
    }

    function addOltPort(oltObj, portType) {
        if (!oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return false;
        var def = getOltPortTypeDef(portType);
        if (!def) {
            safeShowWarning('Неизвестный тип порта: ' + portType, 'Порты OLT');
            return false;
        }
        if (portType === 'pon') {
            var cur = countOltPortsOfType(oltObj, 'pon');
            if (cur >= def.max) {
                safeShowWarning('Достигнут максимум PON-портов (' + def.max + ').', 'Порты OLT');
                return false;
            }
            return setOltPonPortCount(oltObj, cur + 1);
        }
        var count = countOltPortsOfType(oltObj, portType);
        if (count >= def.max) {
            safeShowWarning('Достигнут максимум портов «' + def.label + '» (' + def.max + ').', 'Порты OLT');
            return false;
        }
        if (!oltObj.properties.get('ports') || !oltObj.properties.get('ports').length) {
            buildOltPorts(oltObj);
        }
        oltObj.properties.set(def.counterKey, count + 1);
        buildOltPorts(oltObj);
        return true;
    }

    function removeOltPort(oltObj, portIndex) {
        if (!oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return false;
        portIndex = parseInt(portIndex, 10);
        if (isNaN(portIndex)) return false;
        var ports = oltObj.properties.get('ports') || [];
        var target = null;
        for (var i = 0; i < ports.length; i++) {
            if (ports[i] && Number(ports[i].portIndex) === portIndex) {
                target = ports[i];
                break;
            }
        }
        if (!target) {
            safeShowWarning('Порт не найден', 'Порты OLT');
            return false;
        }
        if (target.portType === 'pon') {
            var ponCount = countOltPortsOfType(oltObj, 'pon');
            if (ponCount <= 1) {
                safeShowWarning('Должен остаться хотя бы один PON-порт.', 'Порты OLT');
                return false;
            }
            if (typeof isOltPortInUse === 'function' && isOltPortInUse(oltObj, ponCount)) {
                safeShowWarning('Последний PON-порт занят. Сначала отключите его.', 'Порты OLT');
                return false;
            }
            return setOltPonPortCount(oltObj, ponCount - 1);
        }
        if (target.connectedCableId) {
            safeShowWarning('Порт занят кабелем. Сначала отключите кабель.', 'Порты OLT');
            return false;
        }
        var def = getOltPortTypeDef(target.portType);
        if (!def) return false;
        var count = countOltPortsOfType(oltObj, target.portType);
        if (count <= 0) return false;
        oltObj.properties.set(def.counterKey, Math.max(0, count - 1));
        var kept = ports.filter(function(p) {
            return !(p && Number(p.portIndex) === portIndex);
        });
        oltObj.properties.set('ports', kept);
        buildOltPorts(oltObj);
        return true;
    }

    function getOltPortTypeLabel(portType) {
        var def = getOltPortTypeDef(portType);
        return def ? def.label : String(portType || '');
    }

    function applyOltModelParams(manufacturer, model) {
        var params = safeGetDeviceOpticalParams('olt', manufacturer, model);
        if (!params) return;

        var oltObj = safeGetCurrentModalObject();
        if (!oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return;

        if (params.txPowerDbm !== undefined) oltObj.properties.set('txPowerDbm', params.txPowerDbm);
        if (params.rxSensitivityDbm !== undefined) oltObj.properties.set('rxSensitivityDbm', params.rxSensitivityDbm);
        if (params.budgetDb !== undefined) oltObj.properties.set('budgetDb', params.budgetDb);
        if (params.wavelengthTxNm !== undefined) oltObj.properties.set('wavelengthTxNm', params.wavelengthTxNm);
        if (params.wavelengthRxNm !== undefined) oltObj.properties.set('wavelengthRxNm', params.wavelengthRxNm);
        if (params.connectorType !== undefined) oltObj.properties.set('connectorType', params.connectorType);
        if (params.ponPorts !== undefined) {
            var existingPon = parseInt(oltObj.properties.get('ponPorts'), 10);
            if (!existingPon || existingPon < 1) {
                oltObj.properties.set('ponPorts', params.ponPorts);
                oltObj.properties.set('ponPortsCount', params.ponPorts);
            } else {
                oltObj.properties.set('ponPortsCount', existingPon);
            }
        }
        if (params.uplinkSfpPorts !== undefined) oltObj.properties.set('uplinkSfpPortsCount', params.uplinkSfpPorts);
        if (params.uplinkSfpPlusPorts !== undefined) oltObj.properties.set('uplinkSfpPlusPortsCount', params.uplinkSfpPlusPorts);
        if (params.rj45Ports !== undefined) oltObj.properties.set('rj45PortsCount', params.rj45Ports);
        if (params.syncPorts !== undefined) oltObj.properties.set('syncPortsCount', params.syncPorts);
        if (params.consolePorts !== undefined) oltObj.properties.set('consolePortsCount', params.consolePorts);
        if (params.defaultPonSfpClass !== undefined) oltObj.properties.set('defaultPonSfpClass', params.defaultPonSfpClass);

        buildOltPorts(oltObj);
        updateOltPortCounters(oltObj);
        safeRefreshObjectModal(oltObj);
    }

    function handleCableCreated(cable, points) {
        if (!cable || !cable.properties) return;
        if (cable.properties.get('type') !== 'cable') return;
        if (typeof isCopperCableType === 'function' && isCopperCableType(cable.properties.get('cableType'))) return;

        var cableUniqueId = cable.properties.get('uniqueId');
        if (!cableUniqueId) return;

        var startObj = null;
        var endObj = null;
        if (points && points.length >= 2) {
            startObj = points[0];
            endObj = points[points.length - 1];
        } else {
            var pts = cable.properties.get('points') || [];
            if (pts.length >= 2) {
                startObj = pts[0];
                endObj = pts[pts.length - 1];
            } else {
                var coords = cable.properties.get('pathCoords');
                if (coords && coords.length >= 2) {
                    startObj = safeFindObjectAtCoords(coords[0]);
                    endObj = safeFindObjectAtCoords(coords[coords.length - 1]);
                }
            }
        }
        if (!startObj || !endObj) return;

        var oltEnd = null;
        var otherEnd = null;
        if (startObj.properties && startObj.properties.get('type') === 'olt') {
            oltEnd = startObj;
            otherEnd = endObj;
        } else if (endObj.properties && endObj.properties.get('type') === 'olt') {
            oltEnd = endObj;
            otherEnd = startObj;
        }
        if (!oltEnd) return;

        // Не мешаем PON: feeder к муфте/кроссу и уже назначенные portAssignments/incoming.
        if (isFiberHostEnd(otherEnd)) return;
        if (cableAssignedToOltPon(oltEnd, cableUniqueId)) return;
        if (findOltPortByCableId(oltEnd, cableUniqueId)) return;
        // Направленная прокладка с карточки OLT (PON/SFP) — не открывать uplink-модалку.
        if (typeof isOltPortDirectedCableLayActive === 'function' && isOltPortDirectedCableLayActive()) return;
        if (typeof pendingOltPortPresetResult !== 'undefined' && pendingOltPortPresetResult) return;

        var freePorts = findFreeOltPorts(oltEnd);
        if (!freePorts.length) return;

        openOltPortSelectionModal(oltEnd, cableUniqueId,
            function(portIndex) {
                console.log('[OLT] Кабель ' + cableUniqueId + ' подключён к uplink-порту ' + portIndex);
                safeRefreshObjectModal(oltEnd);
            },
            function(userCancelled) {
                if (!userCancelled) return;
                safeDeleteObject(cable);
                safeShowInfo('Подключение кабеля к uplink OLT отменено', 'Отмена');
            }
        );
    }

    document.addEventListener('cableCreated', function(e) {
        if (e.detail && e.detail.cable) handleCableCreated(e.detail.cable, e.detail.points);
    });

    window.applyOltModelParams = applyOltModelParams;
    window.openOltPortSelectionModal = openOltPortSelectionModal;
    window.closeOltPortSelectionModal = closeOltPortSelectionModal;
    window.openSignalTraceModal = openSignalTraceModal;
    window.closeSignalTraceModal = closeSignalTraceModal;
    window.openSignalLevelFromOltPort = openSignalLevelFromOltPort;
    window.openSignalLevelFromUplinkPort = openSignalLevelFromUplinkPort;
    window.calculateSignalAlongPath = calculateSignalAlongPath;
    window.buildPathFromTrace = buildPathFromTrace;
    window.buildOltPorts = buildOltPorts;
    window.updateOltPortCounters = updateOltPortCounters;
    window.addOltPort = addOltPort;
    window.removeOltPort = removeOltPort;
    window.setOltPonPortCount = setOltPonPortCount;
    window.getOltExtraPortTypeDefs = getOltExtraPortTypeDefs;
    window.getOltPortTypeLabel = getOltPortTypeLabel;
    window.OLT_PORT_TYPE_DEFS = OLT_PORT_TYPE_DEFS;
    window.getOltInstalledSfp = getOltInstalledSfp;
    window.setOltInstalledSfp = setOltInstalledSfp;
    window.getOpticalParamsForDevice = getOpticalParamsForDevice;

    window.assignCableToOltPortByIndex = assignCableToOltPortByIndex;
    window.releaseOltPortForCable = function(cableUniqueId) {
        var oltObj = findOltByCableId(cableUniqueId);
        if (oltObj) releaseCableFromOltPort(oltObj, cableUniqueId);
    };

    console.log('[optical-calculator] Загружен');
})();
