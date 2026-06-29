/**
 * Wi‑Fi радиомосты: точка-точка (P2P) и точка-многоточка (P2MP).
 */
var RADIO_BRIDGE_LINE_COLOR = '#06b6d4';
var RADIO_BRIDGE_COVERAGE_DEFAULT_KM = 3;
var radioBridgeCoverageOverlays = [];
var radioBridgeCoveragePulseEntries = [];
var radioBridgeCoveragePulseAnim = null;

function parseCoverageKm(val, fallbackKm) {
    if (val === 0 || val === '0') return 0;
    var n = parseFloat(val);
    if (isNaN(n) || n < 0) return fallbackKm != null ? fallbackKm : RADIO_BRIDGE_COVERAGE_DEFAULT_KM;
    return n;
}

function normalizeStoredCoverageKm(val) {
    if (val == null || val === '') return null;
    var n = parseFloat(val);
    if (isNaN(n) || n < 0) return null;
    if (n > 50) return n / 1000;
    return n;
}

function getRadioBridgeCoverageRadiusKm(rb) {
    if (!rb || !rb.properties) return RADIO_BRIDGE_COVERAGE_DEFAULT_KM;
    var km = normalizeStoredCoverageKm(rb.properties.get('coverageRadiusKm'));
    if (km != null) return parseCoverageKm(km);
    var legacyM = rb.properties.get('coverageRadiusM');
    if (legacyM != null && legacyM !== '') return parseCoverageKm(legacyM / 1000);
    return RADIO_BRIDGE_COVERAGE_DEFAULT_KM;
}

function getRadioBridgeCoverageLengthKm(rb) {
    if (!rb || !rb.properties) return getRadioBridgeCoverageRadiusKm(rb);
    var km = normalizeStoredCoverageKm(rb.properties.get('coverageLengthKm'));
    if (km != null) return parseCoverageKm(km);
    var legacyM = rb.properties.get('coverageLengthM');
    if (legacyM != null && legacyM !== '') return parseCoverageKm(legacyM / 1000);
    return getRadioBridgeCoverageRadiusKm(rb);
}

function coverageKmToMeters(km) {
    return parseCoverageKm(km) * 1000;
}

function formatCoverageKmLabel(km) {
    var n = parseCoverageKm(km);
    if (Math.abs(n - Math.round(n)) < 0.001) return Math.round(n) + ' км';
    return (Math.round(n * 100) / 100) + ' км';
}

/** Точка на расстоянии distM (м) от center по азимуту bearingDeg (0° — север, по часовой). center: [широта, долгота]. */
function rbDestinationPoint(center, distM, bearingDeg) {
    var R = 6378137;
    var lat1 = center[0] * Math.PI / 180;
    var lon1 = center[1] * Math.PI / 180;
    var brng = bearingDeg * Math.PI / 180;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(distM / R) + Math.cos(lat1) * Math.sin(distM / R) * Math.cos(brng));
    var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distM / R) * Math.cos(lat1), Math.cos(distM / R) - Math.sin(lat1) * Math.sin(lat2));
    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

function rbLerpCoord(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function rbCoverageArcSteps(spanDeg, lengthM) {
    return Math.max(72, Math.min(180, Math.ceil(spanDeg * 2.5 + lengthM / 200)));
}

function buildRadioBridgeSectorRing(center, lengthM, azimuthDeg, angleDeg) {
    var start = azimuthDeg - angleDeg / 2;
    var end = azimuthDeg + angleDeg / 2;
    var steps = rbCoverageArcSteps(angleDeg, lengthM);
    var ring = [center];
    for (var i = 0; i <= steps; i++) {
        ring.push(rbDestinationPoint(center, lengthM, start + (end - start) * i / steps));
    }
    return ring;
}

/** Направленный луч: длина вдоль азимута, радиус — полуширина на дальней кромке (в метрах для геометрии). */
function buildRadioBridgeDirectionalBeam(center, lengthM, halfWidthM, azimuthDeg) {
    if (!lengthM || lengthM <= 0) return [center];
    var axisEnd = rbDestinationPoint(center, lengthM, azimuthDeg);
    if (!halfWidthM || halfWidthM <= 0) {
        return [center, axisEnd, center];
    }
    var farLeft = rbDestinationPoint(axisEnd, halfWidthM, azimuthDeg - 90);
    var farRight = rbDestinationPoint(axisEnd, halfWidthM, azimuthDeg + 90);
    var ring = [center];
    var sideSteps = 4;
    for (var l = 1; l <= sideSteps; l++) {
        ring.push(rbLerpCoord(center, farLeft, l / sideSteps));
    }
    var arcSteps = Math.max(72, Math.ceil(halfWidthM / 20));
    for (var i = 1; i <= arcSteps; i++) {
        ring.push(rbDestinationPoint(axisEnd, halfWidthM, azimuthDeg - 90 + 180 * i / arcSteps));
    }
    for (var r = sideSteps - 1; r >= 0; r--) {
        ring.push(rbLerpCoord(farRight, center, r / sideSteps));
    }
    return ring;
}

/** Облегчённая геометрия для анимации пульса (меньше точек). */
function buildRadioBridgeSectorRingPulse(center, lengthM, azimuthDeg, angleDeg) {
    var start = azimuthDeg - angleDeg / 2;
    var end = azimuthDeg + angleDeg / 2;
    var steps = Math.min(36, Math.max(16, Math.ceil(angleDeg * 1.2)));
    var ring = [center];
    for (var i = 0; i <= steps; i++) {
        ring.push(rbDestinationPoint(center, lengthM, start + (end - start) * i / steps));
    }
    return ring;
}

function buildRadioBridgeDirectionalBeamPulse(center, lengthM, halfWidthM, azimuthDeg) {
    if (!lengthM || lengthM <= 0) return [center];
    var axisEnd = rbDestinationPoint(center, lengthM, azimuthDeg);
    if (!halfWidthM || halfWidthM <= 0) {
        return [center, axisEnd, center];
    }
    var farLeft = rbDestinationPoint(axisEnd, halfWidthM, azimuthDeg - 90);
    var farRight = rbDestinationPoint(axisEnd, halfWidthM, azimuthDeg + 90);
    var ring = [center, farLeft];
    var arcSteps = Math.min(28, Math.max(12, Math.ceil(halfWidthM / 40)));
    for (var i = 1; i < arcSteps; i++) {
        ring.push(rbDestinationPoint(axisEnd, halfWidthM, azimuthDeg - 90 + 180 * i / arcSteps));
    }
    ring.push(farRight, center);
    return ring;
}

function getRadioBridgeCoveragePulseParams(rb) {
    if (!rb || !rb.properties || !rb.geometry) return null;
    var center = rb.geometry.getCoordinates();
    if (!center || center.length < 2) return null;
    return {
        center: center,
        radiusM: coverageKmToMeters(getRadioBridgeCoverageRadiusKm(rb)),
        lengthM: coverageKmToMeters(getRadioBridgeCoverageLengthKm(rb)),
        shape: rb.properties.get('coverageShape') || 'circle',
        az: parseFloat(rb.properties.get('coverageAzimuth')) || 0,
        angle: parseFloat(rb.properties.get('coverageAngle')) || 60
    };
}

function buildRadioBridgeCoveragePulseGeometry(params, scale) {
    if (!params) return null;
    scale = Math.max(0.05, Math.min(1, scale));
    var c = params.center;
    if (params.shape === 'circle') {
        return { kind: 'circle', center: c, radius: params.radiusM * scale };
    }
    var len = params.lengthM * scale;
    var rad = params.radiusM * scale;
    var ring;
    if (params.radiusM > 0) {
        ring = buildRadioBridgeDirectionalBeamPulse(c, len, rad, params.az);
    } else {
        ring = buildRadioBridgeSectorRingPulse(c, len, params.az, params.angle);
    }
    return { kind: 'polygon', ring: ring };
}

function stopRadioBridgeCoveragePulseAnimation() {
    if (radioBridgeCoveragePulseAnim && radioBridgeCoveragePulseAnim.rafId) {
        cancelAnimationFrame(radioBridgeCoveragePulseAnim.rafId);
    }
    radioBridgeCoveragePulseAnim = null;
}

function applyRadioBridgeCoveragePulseFrame(entry, phase) {
    if (!entry || !entry.pulseOverlay) return;
    var params = getRadioBridgeCoveragePulseParams(entry.ownerRb);
    if (!params) return;
    entry.params = params;
    var fade = 1 - phase;
    var geom = buildRadioBridgeCoveragePulseGeometry(params, phase);
    if (!geom) return;
    try {
        if (geom.kind === 'circle') {
            entry.pulseOverlay.geometry.setCoordinates(geom.center);
            entry.pulseOverlay.geometry.setRadius(Math.max(geom.radius, 8));
        } else {
            entry.pulseOverlay.geometry.setCoordinates([geom.ring]);
        }
        entry.pulseOverlay.options.set({
            fillOpacity: 0.2 * fade,
            strokeOpacity: 0.45 * fade
        });
    } catch (ePulse) {}
}

function startRadioBridgeCoveragePulseAnimation() {
    stopRadioBridgeCoveragePulseAnimation();
    if (!radioBridgeCoveragePulseEntries.length) return;
    var startedAt = performance.now();
    radioBridgeCoveragePulseAnim = { rafId: null };

    function tick(now) {
        if (!radioBridgeCoveragePulseAnim) return;
        var elapsed = (now - startedAt) / 1000;
        radioBridgeCoveragePulseEntries.forEach(function(entry) {
            var phase = (elapsed * 0.65 + (entry.phaseOffset || 0)) % 1;
            applyRadioBridgeCoveragePulseFrame(entry, phase);
        });
        radioBridgeCoveragePulseAnim.rafId = requestAnimationFrame(tick);
    }
    radioBridgeCoveragePulseAnim.rafId = requestAnimationFrame(tick);
}

function removeRadioBridgeCoveragePulse(rb) {
    if (!rb || !rb.properties) return;
    radioBridgeCoveragePulseEntries = radioBridgeCoveragePulseEntries.filter(function(entry) {
        if (entry.ownerRb === rb) {
            try { if (myMap && entry.pulseOverlay) myMap.geoObjects.remove(entry.pulseOverlay); } catch (e) {}
            return false;
        }
        return true;
    });
    rb.properties.set('coveragePulseOverlays', null);
    if (!radioBridgeCoveragePulseEntries.length) {
        stopRadioBridgeCoveragePulseAnimation();
    }
}

function clearAllRadioBridgeCoveragePulses() {
    stopRadioBridgeCoveragePulseAnimation();
    radioBridgeCoveragePulseEntries.forEach(function(entry) {
        try { if (myMap && entry.pulseOverlay) myMap.geoObjects.remove(entry.pulseOverlay); } catch (e) {}
    });
    radioBridgeCoveragePulseEntries = [];
}

function addRadioBridgeCoveragePulse(rb) {
    if (!rb || !rb.properties || !myMap) return;
    removeRadioBridgeCoveragePulse(rb);
    var params = getRadioBridgeCoveragePulseParams(rb);
    if (!params) return;
    var initGeom = buildRadioBridgeCoveragePulseGeometry(params, 0.05);
    if (!initGeom) return;
    var pulseStyle = {
        fillColor: RADIO_BRIDGE_LINE_COLOR,
        fillOpacity: 0.2,
        strokeColor: RADIO_BRIDGE_LINE_COLOR,
        strokeWidth: 2,
        strokeOpacity: 0.45,
        zIndex: 91,
        interactive: false
    };
    var pulses = [];
    [0, 0.5].forEach(function(phaseOffset) {
        var pulse = initGeom.kind === 'circle'
            ? new ymaps.Circle([initGeom.center, initGeom.radius], {}, pulseStyle)
            : new ymaps.Polygon([initGeom.ring], {}, pulseStyle);
        pulse.properties.set('type', 'radioBridgeCoveragePulse');
        myMap.geoObjects.add(pulse);
        pulses.push(pulse);
        radioBridgeCoveragePulseEntries.push({
            pulseOverlay: pulse,
            phaseOffset: phaseOffset,
            ownerRb: rb,
            params: params
        });
    });
    rb.properties.set('coveragePulseOverlays', pulses);
    startRadioBridgeCoveragePulseAnimation();
}

function removeRadioBridgeCoverage(rb) {
    if (!rb || !rb.properties) return;
    removeRadioBridgeCoveragePulse(rb);
    var old = rb.properties.get('coverageOverlay');
    if (old) {
        try { if (myMap) myMap.geoObjects.remove(old); } catch (e) {}
        var idx = radioBridgeCoverageOverlays.indexOf(old);
        if (idx >= 0) radioBridgeCoverageOverlays.splice(idx, 1);
        rb.properties.set('coverageOverlay', null);
    }
}

function updateRadioBridgeCoverage(rb) {
    removeRadioBridgeCoverage(rb);
    if (!rb || !rb.properties || rb.properties.get('type') !== 'radioBridge') return;
    if (!rb.properties.get('showCoverage') || !rb.geometry || !myMap) return;
    var center = rb.geometry.getCoordinates();
    if (!center || center.length < 2) return;
    var radiusKm = getRadioBridgeCoverageRadiusKm(rb);
    var lengthKm = getRadioBridgeCoverageLengthKm(rb);
    var radiusM = coverageKmToMeters(radiusKm);
    var lengthM = coverageKmToMeters(lengthKm);
    var shape = rb.properties.get('coverageShape') || 'circle';
    var overlay;
    var style = {
        fillColor: RADIO_BRIDGE_LINE_COLOR,
        fillOpacity: 0.12,
        strokeColor: RADIO_BRIDGE_LINE_COLOR,
        strokeWidth: 2,
        strokeOpacity: 0.45,
        zIndex: 90
    };
    if (shape === 'sector') {
        var az = parseFloat(rb.properties.get('coverageAzimuth')) || 0;
        var angle = parseFloat(rb.properties.get('coverageAngle')) || 60;
        var ring = radiusM > 0
            ? buildRadioBridgeDirectionalBeam(center, lengthM, radiusM, az)
            : buildRadioBridgeSectorRing(center, lengthM, az, angle);
        overlay = new ymaps.Polygon([ring], {}, style);
    } else {
        overlay = new ymaps.Circle([center, radiusM], {}, style);
    }
    overlay.properties.set('type', 'radioBridgeCoverage');
    overlay.properties.set('ownerId', getObjectUniqueId(rb));
    rb.properties.set('coverageOverlay', overlay);
    radioBridgeCoverageOverlays.push(overlay);
    myMap.geoObjects.add(overlay);
    addRadioBridgeCoveragePulse(rb);
}

function updateAllRadioBridgeCoverages() {
    radioBridgeCoverageOverlays.forEach(function(o) {
        try { if (myMap) myMap.geoObjects.remove(o); } catch (e) {}
    });
    radioBridgeCoverageOverlays = [];
    clearAllRadioBridgeCoveragePulses();
    objects.forEach(function(o) {
        if (o.properties && o.properties.get('type') === 'radioBridge') {
            o.properties.set('coverageOverlay', null);
            o.properties.set('coveragePulseOverlays', null);
            updateRadioBridgeCoverage(o);
        }
    });
}

function isRadioBridgeLinkedOnHost(rbId) {
    if (!rbId) return false;
    var key = String(rbId);
    for (var i = 0; i < objects.length; i++) {
        var slot = objects[i];
        if (!slot.properties || !isFiberHostType(slot.properties.get('type'))) continue;
        var rbConn = slot.properties.get('radioBridgeConnections') || {};
        for (var connKey in rbConn) {
            if (!Object.prototype.hasOwnProperty.call(rbConn, connKey)) continue;
            var conn = rbConn[connKey];
            if (conn && conn.radioBridgeId != null && String(conn.radioBridgeId) === key) return true;
        }
    }
    return false;
}

function isRadioBridgeUsedInNetwork(rbId) {
    if (!rbId) return false;
    if (isRadioBridgeLinkedOnHost(rbId)) return true;
    var rbObj = getMapObjectByUid(rbId, 'radioBridge');
    if (rbObj && rbObj.properties) {
        var inc = rbObj.properties.get('incomingFiber');
        if (inc && inc.cableId) {
            if (typeof isFiberExistingOnCable === 'function' &&
                !isFiberExistingOnCable(inc.cableId, inc.fiberNumber)) {
                rbObj.properties.set('incomingFiber', null);
            } else {
                return true;
            }
        }
    }
    return false;
}

function getAvailableRadioBridges() {
    return listRadioBridges(function(rb) {
        var uid = getObjectUniqueId(rb);
        if (rb.properties.get('incomingFiber') && rb.properties.get('incomingFiber').cableId) return false;
        if (typeof isRadioBridgeUsedInNetwork === 'function' && isRadioBridgeUsedInNetwork(uid)) return false;
        return typeof hasObjectRoutingCoords === 'function' ? hasObjectRoutingCoords(rb) : !!(rb && rb.geometry);
    });
}

function applyRadioBridgeCoverageSettings(rb) {
    if (!rb || !rb.properties) return;
    updateRadioBridgeCoverage(rb);
    saveData({ object: rb, syncImmediate: true });
}

function getRadioBridgeModeLabel(mode) {
    if (mode === 'ptmp') return 'Точка — многоточка';
    return 'Точка — точка';
}

function getRadioBridgeRoleLabel(role, bridgeMode) {
    if (bridgeMode === 'ptp' || role === 'ptp') return 'Конечная точка (P2P)';
    if (role === 'ap') return 'Базовая станция (AP)';
    if (role === 'station') return 'Абонентская станция';
    return role || '—';
}

function isRadioBridgePtp(obj) {
    return obj && obj.properties && obj.properties.get('bridgeMode') === 'ptp';
}

function isRadioBridgeAp(obj) {
    return obj && obj.properties &&
        obj.properties.get('bridgeMode') === 'ptmp' &&
        obj.properties.get('role') === 'ap';
}

function isRadioBridgeStation(obj) {
    return obj && obj.properties &&
        obj.properties.get('bridgeMode') === 'ptmp' &&
        obj.properties.get('role') === 'station';
}

function getApPtpPeerLinks(ap) {
    if (!ap || !ap.properties || !isRadioBridgeAp(ap)) return [];
    var links = ap.properties.get('ptpPeerLinks');
    if (Array.isArray(links) && links.length) return links;
    var legacyId = ap.properties.get('ptpPeerId');
    if (legacyId) {
        return [{
            peerId: legacyId,
            peerName: ap.properties.get('ptpPeerName') || '',
            routeIds: []
        }];
    }
    return [];
}

function setApPtpPeerLinks(ap, links) {
    if (!ap || !ap.properties) return;
    ap.properties.set('ptpPeerLinks', Array.isArray(links) ? links : []);
    ap.properties.set('ptpPeerId', null);
    ap.properties.set('ptpPeerName', null);
}

function removeApPtpPeerLink(ap, ptpPeerId) {
    if (!ap || !ptpPeerId) return;
    var links = getApPtpPeerLinks(ap).filter(function(l) { return l && l.peerId !== ptpPeerId; });
    setApPtpPeerLinks(ap, links);
}

function isRadioBridgeLinked(obj) {
    if (!obj || !obj.properties) return false;
    if (isRadioBridgePtp(obj)) return !!obj.properties.get('peerBridgeId');
    if (isRadioBridgeAp(obj)) {
        return !!(getApPtpPeerLinks(obj).length || (obj.properties.get('stationLinks') || []).length);
    }
    if (isRadioBridgeStation(obj)) {
        return !!(obj.properties.get('apBridgeId') || obj.properties.get('ptpPeerId'));
    }
    return false;
}

function canBePtpLinkTarget(rb) {
    if (!rb || !rb.properties) return false;
    if (isRadioBridgePtp(rb)) return !rb.properties.get('peerBridgeId');
    if (isRadioBridgeStation(rb)) {
        return !rb.properties.get('apBridgeId') && !rb.properties.get('ptpPeerId');
    }
    if (isRadioBridgeAp(rb)) return true;
    return false;
}

function getPtpLinkTargetLabel(rb) {
    if (!rb || !rb.properties) return 'Радиомост';
    var name = rb.properties.get('name') || 'Радиомост';
    if (isRadioBridgePtp(rb)) return name + ' (P2P)';
    if (isRadioBridgeAp(rb)) return name + ' (AP)';
    if (isRadioBridgeStation(rb)) return name + ' (станция)';
    return name;
}

function saveRadioBridgeLinkChanges(affected) {
    var list = [];
    (affected || []).forEach(function(o) {
        if (o && list.indexOf(o) < 0) list.push(o);
    });
    if (list.length) {
        saveData({ objects: list, syncImmediate: true });
    } else {
        saveData({ syncImmediate: true });
    }
}

function clearRadioBridgePtpPeerSide(peer, remotePtpId) {
    if (!peer || !peer.properties) return;
    if (isRadioBridgePtp(peer)) {
        peer.properties.set('peerBridgeId', null);
        peer.properties.set('peerBridgeName', null);
        peer.properties.set('routeIds', []);
    } else if (isRadioBridgeStation(peer)) {
        peer.properties.set('ptpPeerId', null);
        peer.properties.set('ptpPeerName', null);
        peer.properties.set('routeIds', []);
    } else if (isRadioBridgeAp(peer)) {
        removeApPtpPeerLink(peer, remotePtpId);
    }
}

function listRadioBridges(filterFn) {
    return objects.filter(function(o) {
        return o.properties && o.properties.get('type') === 'radioBridge' && (!filterFn || filterFn(o));
    });
}

function getAvailablePtpLinkTargets(excludeUid) {
    return listRadioBridges(function(rb) {
        var uid = getObjectUniqueId(rb);
        if (excludeUid && uid === excludeUid) return false;
        return canBePtpLinkTarget(rb);
    });
}

/** @deprecated use getAvailablePtpLinkTargets */
function getAvailablePtpRadioBridges(excludeUid) {
    return getAvailablePtpLinkTargets(excludeUid);
}

function getAvailablePtpPeersForAp() {
    return listRadioBridges(function(rb) {
        return isRadioBridgePtp(rb) && !rb.properties.get('peerBridgeId');
    });
}

function getAvailablePtmpStations(excludeUid) {
    return listRadioBridges(function(rb) {
        var uid = getObjectUniqueId(rb);
        if (excludeUid && uid === excludeUid) return false;
        return isRadioBridgeStation(rb) && !rb.properties.get('apBridgeId') && !rb.properties.get('ptpPeerId');
    });
}

function getAvailablePtmpAps(excludeUid) {
    return listRadioBridges(function(rb) {
        var uid = getObjectUniqueId(rb);
        if (excludeUid && uid === excludeUid) return false;
        return isRadioBridgeAp(rb);
    });
}

function connectPtpRadioBridges(bridgeA, bridgeB, routeIds) {
    if (!bridgeA || !bridgeB || bridgeA === bridgeB) return false;
    if (!isRadioBridgePtp(bridgeA)) {
        if (typeof showError === 'function') showError('Источник должен быть радиомостом в режиме «точка-точка».', 'Недопустимое действие');
        return false;
    }
    if (bridgeA.properties.get('peerBridgeId')) {
        if (typeof showError === 'function') showError('Этот радиомост уже подключён. Сначала отключите существующий радиолинк.', 'Связь занята');
        return false;
    }
    if (!canBePtpLinkTarget(bridgeB)) {
        if (typeof showError === 'function') {
            showError('Недопустимая цель: радиомост уже занят или абонентская станция подключена к AP.', 'Недопустимое действие');
        }
        return false;
    }
    if (isRadioBridgePtp(bridgeB) && !isRadioBridgePtp(bridgeA)) {
        return false;
    }
    routeIds = typeof resolveGponRouteIds === 'function' ? resolveGponRouteIds(routeIds || []) : (routeIds || []);
    var uidA = getObjectUniqueId(bridgeA);
    var uidB = getObjectUniqueId(bridgeB);
    if (isRadioBridgeAp(bridgeB) && getApPtpPeerLinks(bridgeB).some(function(l) { return l && l.peerId === uidA; })) {
        if (typeof showError === 'function') showError('Этот P2P-радиомост уже подключён к базовой станции.', 'Связь занята');
        return false;
    }
    var nameA = bridgeA.properties.get('name') || 'Радиомост';
    var nameB = bridgeB.properties.get('name') || 'Радиомост';
    bridgeA.properties.set('peerBridgeId', uidB);
    bridgeA.properties.set('peerBridgeName', nameB);
    bridgeA.properties.set('routeIds', routeIds.slice());
    if (isRadioBridgePtp(bridgeB)) {
        bridgeB.properties.set('peerBridgeId', uidA);
        bridgeB.properties.set('peerBridgeName', nameA);
        bridgeB.properties.set('routeIds', routeIds.slice());
    } else if (isRadioBridgeStation(bridgeB)) {
        bridgeB.properties.set('ptpPeerId', uidA);
        bridgeB.properties.set('ptpPeerName', nameA);
        bridgeB.properties.set('routeIds', routeIds.slice());
    } else if (isRadioBridgeAp(bridgeB)) {
        var apPtpLinks = getApPtpPeerLinks(bridgeB).slice();
        apPtpLinks.push({
            peerId: uidA,
            peerName: nameA,
            routeIds: routeIds.slice()
        });
        setApPtpPeerLinks(bridgeB, apPtpLinks);
    }
    if (typeof createRadioBridgeConnectionLine === 'function') {
        createRadioBridgeConnectionLine(bridgeA, bridgeB, uidA + '-ptp-' + uidB, routeIds);
    }
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    saveRadioBridgeLinkChanges([bridgeA, bridgeB]);
    return true;
}

function disconnectApPtpPeer(ap, ptpPeerId) {
    if (!ap || !ptpPeerId) return;
    var ptpBridge = getMapObjectByUid(ptpPeerId, 'radioBridge');
    if (ptpBridge && isRadioBridgePtp(ptpBridge)) {
        disconnectPtpRadioBridge(ptpBridge);
    } else {
        removeApPtpPeerLink(ap, ptpPeerId);
        saveRadioBridgeLinkChanges([ap]);
    }
}

function disconnectPtpPeerLink(obj) {
    if (!obj || !obj.properties) return;
    var ptpPeerId = obj.properties.get('ptpPeerId');
    if (!ptpPeerId) return;
    var ptpBridge = getMapObjectByUid(ptpPeerId, 'radioBridge');
    if (ptpBridge && isRadioBridgePtp(ptpBridge)) {
        disconnectPtpRadioBridge(ptpBridge);
    }
}

function disconnectPtpRadioBridge(bridge) {
    if (!bridge || !bridge.properties || !isRadioBridgePtp(bridge)) return;
    var peerId = bridge.properties.get('peerBridgeId');
    var uid = getObjectUniqueId(bridge);
    var affected = [bridge];
    bridge.properties.set('peerBridgeId', null);
    bridge.properties.set('peerBridgeName', null);
    bridge.properties.set('routeIds', []);
    if (peerId) {
        var peer = getMapObjectByUid(peerId, 'radioBridge');
        if (peer) {
            clearRadioBridgePtpPeerSide(peer, uid);
            affected.push(peer);
        }
        if (typeof removeRadioBridgeConnectionLine === 'function') {
            removeRadioBridgeConnectionLine(uid + '-ptp-' + peerId);
            removeRadioBridgeConnectionLine(peerId + '-ptp-' + uid);
        }
    }
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    saveRadioBridgeLinkChanges(affected);
}

function connectPtmpStation(ap, station, routeIds) {
    if (!ap || !station || ap === station) return false;
    if (!isRadioBridgeAp(ap) || !isRadioBridgeStation(station)) {
        if (typeof showError === 'function') showError('Связь возможна только между базовой станцией (AP) и абонентской станцией.', 'Недопустимое действие');
        return false;
    }
    if (station.properties.get('apBridgeId')) {
        if (typeof showError === 'function') showError('Абонентская станция уже подключена к другой базовой станции.', 'Связь занята');
        return false;
    }
    if (station.properties.get('ptpPeerId')) {
        if (typeof showError === 'function') showError('Абонентская станция уже подключена по радиолинку «точка-точка».', 'Связь занята');
        return false;
    }
    routeIds = typeof resolveGponRouteIds === 'function' ? resolveGponRouteIds(routeIds || []) : (routeIds || []);
    var apUid = getObjectUniqueId(ap);
    var stUid = getObjectUniqueId(station);
    var links = (ap.properties.get('stationLinks') || []).slice();
    if (links.some(function(l) { return l && l.stationId === stUid; })) {
        if (typeof showError === 'function') showError('Эта станция уже в списке базовой станции.', 'Связь занята');
        return false;
    }
    links.push({
        stationId: stUid,
        stationName: station.properties.get('name') || 'Станция',
        routeIds: routeIds.slice()
    });
    ap.properties.set('stationLinks', links);
    station.properties.set('apBridgeId', apUid);
    station.properties.set('apBridgeName', ap.properties.get('name') || 'Базовая станция');
    station.properties.set('routeIds', routeIds.slice());
    if (typeof createRadioBridgeConnectionLine === 'function') {
        createRadioBridgeConnectionLine(ap, station, apUid + '-ptmp-' + stUid, routeIds);
    }
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    saveRadioBridgeLinkChanges([ap, station]);
    return true;
}

function disconnectPtmpStation(ap, stationId) {
    if (!ap || !ap.properties || !isRadioBridgeAp(ap) || !stationId) return;
    var apUid = getObjectUniqueId(ap);
    var links = (ap.properties.get('stationLinks') || []).filter(function(l) {
        return l && l.stationId !== stationId;
    });
    ap.properties.set('stationLinks', links);
    var station = getMapObjectByUid(stationId, 'radioBridge');
    var affected = [ap];
    if (station) {
        station.properties.set('apBridgeId', null);
        station.properties.set('apBridgeName', null);
        station.properties.set('routeIds', []);
        affected.push(station);
    }
    if (typeof removeRadioBridgeConnectionLine === 'function') {
        removeRadioBridgeConnectionLine(apUid + '-ptmp-' + stationId);
    }
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    saveRadioBridgeLinkChanges(affected);
}

function disconnectPtmpStationFromAp(station) {
    if (!station || !station.properties || !isRadioBridgeStation(station)) return;
    var apId = station.properties.get('apBridgeId');
    if (!apId) return;
    var ap = getMapObjectByUid(apId, 'radioBridge');
    if (ap) disconnectPtmpStation(ap, getObjectUniqueId(station));
    else {
        station.properties.set('apBridgeId', null);
        station.properties.set('apBridgeName', null);
        station.properties.set('routeIds', []);
        saveRadioBridgeLinkChanges([station]);
    }
}

function purgeRadioBridgeReferences(deletedUid) {
    if (!deletedUid) return;
    var affected = [];
    objects.forEach(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'radioBridge') return;
        var uid = getObjectUniqueId(obj);
        if (uid === deletedUid) return;
        var changed = false;
        if (isRadioBridgePtp(obj) && obj.properties.get('peerBridgeId') === deletedUid) {
            obj.properties.set('peerBridgeId', null);
            obj.properties.set('peerBridgeName', null);
            obj.properties.set('routeIds', []);
            changed = true;
        }
        if (isRadioBridgeStation(obj)) {
            if (obj.properties.get('apBridgeId') === deletedUid) {
                obj.properties.set('apBridgeId', null);
                obj.properties.set('apBridgeName', null);
                obj.properties.set('routeIds', []);
                changed = true;
            }
            if (obj.properties.get('ptpPeerId') === deletedUid) {
                obj.properties.set('ptpPeerId', null);
                obj.properties.set('ptpPeerName', null);
                obj.properties.set('routeIds', []);
                changed = true;
            }
        }
        if (isRadioBridgeAp(obj)) {
            var apPtpBefore = getApPtpPeerLinks(obj).length;
            removeApPtpPeerLink(obj, deletedUid);
            if (getApPtpPeerLinks(obj).length !== apPtpBefore) changed = true;
            var links = obj.properties.get('stationLinks') || [];
            var filtered = links.filter(function(l) { return l && l.stationId !== deletedUid; });
            if (filtered.length !== links.length) {
                obj.properties.set('stationLinks', filtered);
                changed = true;
            }
        }
        if (changed) affected.push(obj);
    });
    if (affected.length) saveRadioBridgeLinkChanges(affected);
}

function startRadioBridgeRouting(sourceBridge, targetBridge, linkKind) {
    if (!sourceBridge || !targetBridge) return;
    radioBridgeRoutingMode = true;
    radioBridgeRoutingData = {
        sourceBridge: sourceBridge,
        targetBridge: targetBridge,
        linkKind: linkKind || (isRadioBridgePtp(sourceBridge) ? 'ptp' : 'ptmp'),
        targetId: getObjectUniqueId(targetBridge)
    };
    radioBridgeWaypoints = [];
    var srcName = sourceBridge.properties.get('name') || 'Радиомост';
    var tgtName = targetBridge.properties.get('name') || 'Радиомост';
    if (typeof showInfo === 'function') {
        showInfo('Прокладка радиолинка: «' + srcName + '» → «' + tgtName + '». Кликайте по опорам и креплениям для маршрута, затем по целевому радиомосту для завершения. Escape — отмена.', 'Радиолинк');
    }
    if (typeof selectObject === 'function') selectObject(sourceBridge);
    if (typeof applyGponRoutingMapHighlight === 'function') applyGponRoutingMapHighlight(sourceBridge, targetBridge);
    if (typeof syncMapPanLockForEditTools === 'function') syncMapPanLockForEditTools();
    var modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    if (typeof areFiberRoutingHostsCoLocated === 'function' &&
        areFiberRoutingHostsCoLocated(sourceBridge, targetBridge)) {
        completeRadioBridgeRouting();
    }
}

function cancelRadioBridgeRouting() {
    var endpoints = radioBridgeRoutingData
        ? [radioBridgeRoutingData.sourceBridge, radioBridgeRoutingData.targetBridge]
        : [];
    radioBridgeRoutingMode = false;
    radioBridgeRoutingData = null;
    radioBridgeWaypoints = [];
    placementPanBlockClickUntil = 0;
    if (placementPanPointer) {
        placementPanPointer.down = false;
        placementPanPointer.moved = false;
    }
    if (radioBridgePreviewLine) {
        myMap.geoObjects.remove(radioBridgePreviewLine);
        radioBridgePreviewLine = null;
    }
    if (gponRoutingHighlightIconState && gponRoutingHighlightIconState.length) {
        gponRoutingHighlightIconState.forEach(function(entry) {
            if (entry) entry.hadSelected = false;
        });
    }
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof clearGponRoutingMapHighlight === 'function') clearGponRoutingMapHighlight();
    endpoints.forEach(function(rb) {
        if (rb && rb.properties && typeof applyMapPlacemarkIcon === 'function') {
            applyMapPlacemarkIcon(rb, 'radioBridge', 'normal', rb);
        }
    });
    if (typeof syncMapPanLockForEditTools === 'function') syncMapPanLockForEditTools();
}

function addRadioBridgeWaypoint(wp) {
    if (!wp) return;
    var wpId = getObjectUniqueId(wp);
    if (!wpId) return;
    var idx = radioBridgeWaypoints.findIndex(function(w) { return getObjectUniqueId(w) === wpId; });
    if (idx >= 0) {
        radioBridgeWaypoints.splice(idx, 1);
    } else {
        radioBridgeWaypoints.push(wp);
    }
}

function updateRadioBridgePreview() {
    if (!radioBridgeRoutingMode || !radioBridgeRoutingData) return;
    if (radioBridgePreviewLine) {
        myMap.geoObjects.remove(radioBridgePreviewLine);
        radioBridgePreviewLine = null;
    }
    var data = radioBridgeRoutingData;
    var points = [];
    var src = data.sourceBridge;
    if (src && src.geometry) points.push(src.geometry.getCoordinates());
    radioBridgeWaypoints.forEach(function(wp) {
        if (wp && wp.geometry) points.push(wp.geometry.getCoordinates());
    });
    var tgt = data.targetBridge;
    if (tgt && tgt.geometry) points.push(tgt.geometry.getCoordinates());
    if (points.length < 2) return;
    radioBridgePreviewLine = new ymaps.Polyline(points, {}, {
        strokeColor: RADIO_BRIDGE_LINE_COLOR,
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.55
    });
    myMap.geoObjects.add(radioBridgePreviewLine);
}

function completeRadioBridgeRouting() {
    if (!radioBridgeRoutingMode || !radioBridgeRoutingData) return;
    var data = radioBridgeRoutingData;
    var routeIds = typeof resolveGponRouteIds === 'function'
        ? resolveGponRouteIds(radioBridgeWaypoints.map(function(wp) {
            return getObjectUniqueId(wp);
        }))
        : radioBridgeWaypoints.map(function(wp) { return getObjectUniqueId(wp); }).filter(Boolean);
    var ok = false;
    if (data.linkKind === 'ptp') {
        ok = connectPtpRadioBridges(data.sourceBridge, data.targetBridge, routeIds);
    } else {
        ok = connectPtmpStation(data.sourceBridge, data.targetBridge, routeIds);
    }
    var sourceBridge = data.sourceBridge;
    cancelRadioBridgeRouting();
    if (ok && sourceBridge && typeof showObjectInfo === 'function') {
        showObjectInfo(sourceBridge);
    }
}

function isRadioBridgeRoutingTarget(obj) {
    if (!radioBridgeRoutingMode || !radioBridgeRoutingData || !obj) return false;
    return getObjectUniqueId(obj) === radioBridgeRoutingData.targetId;
}

function handleRadioBridgeRoutingPlacemarkClick(placemark, type) {
    if (!radioBridgeRoutingMode || !radioBridgeRoutingData) return false;
    if (Date.now() < placementPanBlockClickUntil) return true;
    var objId = getObjectUniqueId(placemark);
    if (objId === radioBridgeRoutingData.targetId) {
        completeRadioBridgeRouting();
        return true;
    }
    if (type === 'support' || type === 'attachment') {
        addRadioBridgeWaypoint(placemark);
        updateRadioBridgePreview();
        return true;
    }
    if (objId === getObjectUniqueId(radioBridgeRoutingData.sourceBridge)) {
        radioBridgeWaypoints = [];
        updateRadioBridgePreview();
        return true;
    }
    var tgtName = radioBridgeRoutingData.targetBridge
        ? (radioBridgeRoutingData.targetBridge.properties.get('name') || 'радиомост')
        : 'радиомост';
    if (typeof showWarning === 'function') {
        showWarning('Кликните по опоре или креплению для маршрута, или по целевому радиомосту («' + escapeHtml(tgtName) + '») для завершения.', 'Радиолинк');
    }
    return true;
}

function handleRadioBridgeRoutingClick(coords) {
    if (!radioBridgeRoutingMode || !radioBridgeRoutingData) return;
    var zoom = myMap ? myMap.getZoom() : 15;
    var clickedObject = typeof findObjectAtCoords === 'function'
        ? findObjectAtCoords(coords, null, {
            pixelRadius: typeof getCableSnapPixelRadius === 'function'
                ? getCableSnapPixelRadius(zoom, 'click')
                : undefined
        })
        : null;
    if (clickedObject && clickedObject.geometry) {
        var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
        handleRadioBridgeRoutingPlacemarkClick(clickedObject, objType);
        return;
    }
    var tgtName = radioBridgeRoutingData.targetBridge
        ? (radioBridgeRoutingData.targetBridge.properties.get('name') || 'радиомост')
        : 'радиомост';
    if (typeof showWarning === 'function') {
        showWarning('Кликните по опоре, креплению или целевому радиомосту («' + escapeHtml(tgtName) + '»).', 'Радиолинк');
    }
}

function updateRadioBridgePreviewWithCursor(cursorCoords) {
    if (!radioBridgeRoutingMode || !radioBridgeRoutingData || !cursorCoords) return;
    if (radioBridgePreviewLine) {
        myMap.geoObjects.remove(radioBridgePreviewLine);
        radioBridgePreviewLine = null;
    }
    var data = radioBridgeRoutingData;
    var points = [];
    var src = data.sourceBridge;
    if (src && src.geometry) points.push(src.geometry.getCoordinates());
    radioBridgeWaypoints.forEach(function(wp) {
        if (wp && wp.geometry) points.push(wp.geometry.getCoordinates());
    });
    points.push(cursorCoords);
    if (points.length < 2) return;
    radioBridgePreviewLine = new ymaps.Polyline(points, {}, {
        strokeColor: RADIO_BRIDGE_LINE_COLOR,
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.55
    });
    myMap.geoObjects.add(radioBridgePreviewLine);
}

function buildRadioBridgeCardContent(obj, isEdit, name) {
    var bridgeMode = obj.properties.get('bridgeMode') || 'ptp';
    var role = obj.properties.get('role') || (bridgeMode === 'ptp' ? 'ptp' : 'station');
    var manufacturer = obj.properties.get('manufacturer') || '';
    var model = obj.properties.get('model') || '';
    var comment = obj.properties.get('comment') || '';
    var linked = isRadioBridgeLinked(obj);
    var uid = getObjectUniqueId(obj);
    var html = '';
    html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
    html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Wi‑Fi радиомост</h4>';
    html += '<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 12px;">Беспроводной радиомост на карте. Режим «точка-точка» — связь двух радиомостов; «точка-многоточка» — базовая станция (AP) и абонентские станции.</p>';

    if (isEdit) {
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label for="editRadioBridgeName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название</label>';
        html += '<input type="text" id="editRadioBridgeName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название радиомоста">';
        html += '</div>';
        html += '<div class="form-group" style="margin-bottom: 8px;">';
        html += '<label style="font-size: 0.8125rem; color: var(--text-secondary);">Режим</label>';
        if (linked) {
            html += '<div style="font-size: 0.875rem; color: var(--text-secondary);">' + escapeHtml(getRadioBridgeModeLabel(bridgeMode)) + '</div>';
        } else {
            html += '<select id="editRadioBridgeMode" class="form-select">';
            html += '<option value="ptp"' + (bridgeMode === 'ptp' ? ' selected' : '') + '>Точка — точка</option>';
            html += '<option value="ptmp"' + (bridgeMode === 'ptmp' ? ' selected' : '') + '>Точка — многоточка</option>';
            html += '</select>';
        }
        html += '</div>';
        if (bridgeMode === 'ptmp') {
            html += '<div class="form-group" style="margin-bottom: 8px;">';
            html += '<label style="font-size: 0.8125rem; color: var(--text-secondary);">Роль</label>';
            if (linked) {
                html += '<div style="font-size: 0.875rem; color: var(--text-secondary);">' + escapeHtml(getRadioBridgeRoleLabel(role, bridgeMode)) + '</div>';
            } else {
                html += '<select id="editRadioBridgeRole" class="form-select">';
                html += '<option value="ap"' + (role === 'ap' ? ' selected' : '') + '>Базовая станция (AP)</option>';
                html += '<option value="station"' + (role === 'station' ? ' selected' : '') + '>Абонентская станция</option>';
                html += '</select>';
            }
            html += '</div>';
        }
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="radioBridge" data-type="manufacturer" data-value-id="editRadioBridgeManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editRadioBridgeManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Модель</label>';
        html += '<div class="device-combobox" data-catalog="radioBridge" data-type="model" data-value-id="editRadioBridgeModel" data-manufacturer-id="editRadioBridgeManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editRadioBridgeModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Комментарий</label>';
        html += '<textarea id="editRadioBridgeComment" class="form-input" rows="2" placeholder="Частота, мощность, примечания">' + escapeHtml(comment) + '</textarea></div>';
    } else {
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">Режим: ' + escapeHtml(getRadioBridgeModeLabel(bridgeMode)) + '</div>';
        if (bridgeMode === 'ptmp') {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">Роль: ' + escapeHtml(getRadioBridgeRoleLabel(role, bridgeMode)) + '</div>';
        }
    }
    if (manufacturer || model) {
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Устройство: ' + escapeHtml([manufacturer, model].filter(Boolean).join(' ') || '—') + '</div>';
    }
    if (comment) {
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem; white-space: pre-wrap; margin-top: 6px;">' + escapeHtml(comment) + '</div>';
    }
    html += '</div>';

    var incomingFiber = obj.properties.get('incomingFiber');
    var hasCopperCable = typeof cameraHasCopperCable === 'function' && cameraHasCopperCable(obj);
    html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
    html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Подключение к сети</h4>';
    if (incomingFiber && incomingFiber.cableId) {
        var incCable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && (c.properties.get('uniqueId') || '') === incomingFiber.cableId;
        });
        var incDesc = incCable ? (incCable.properties.get('cableName') || (typeof getCableDescription === 'function' ? getCableDescription(incCable.properties.get('cableType')) : 'Кабель')) : String(incomingFiber.cableId).substring(0, 12) + '…';
        html += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;">Оптика (кросс/муфта): <strong>' + escapeHtml(incDesc) + '</strong>, жила ' + incomingFiber.fiberNumber + '</div>';
    } else {
        html += '<div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 8px;">Оптическая жила не подключена. Подключите с кросса или муфты (чип «Радиомост» в схеме жил).</div>';
    }
    if (hasCopperCable) {
        html += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;">Медный кабель к коммутатору подключён</div>';
    } else if (isEdit && incomingFiber && incomingFiber.cableId) {
        html += '<button type="button" class="btn-copper-connect-from-radio-bridge btn-primary" style="width:100%; margin-bottom: 4px;">🔌 Прокладка медного кабеля к коммутатору</button>';
    }
    html += '</div>';

    var showCoverage = !!obj.properties.get('showCoverage');
    var coverageShape = obj.properties.get('coverageShape') || 'circle';
    var coverageRadiusKm = getRadioBridgeCoverageRadiusKm(obj);
    var coverageLengthKm = getRadioBridgeCoverageLengthKm(obj);
    var coverageAzimuth = obj.properties.get('coverageAzimuth') != null ? obj.properties.get('coverageAzimuth') : 0;
    var coverageAngle = obj.properties.get('coverageAngle') != null ? obj.properties.get('coverageAngle') : 60;
    html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
    html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Зона покрытия</h4>';
    if (isEdit) {
        html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:0.875rem;color:var(--text-secondary);"><input type="checkbox" id="editRadioBridgeShowCoverage"' + (showCoverage ? ' checked' : '') + '> Показывать на карте</label>';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Форма</label>';
        html += '<select id="editRadioBridgeCoverageShape" class="form-select">';
        html += '<option value="circle"' + (coverageShape === 'circle' ? ' selected' : '') + '>Круглая (всенаправленная)</option>';
        html += '<option value="sector"' + (coverageShape === 'sector' ? ' selected' : '') + '>Направленная (луч)</option>';
        html += '</select></div>';
        html += '<div id="editRadioBridgeCircleFields" style="' + (coverageShape === 'circle' ? '' : 'display:none;') + '">';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Радиус, км</label>';
        html += '<input type="number" id="editRadioBridgeCoverageRadius" class="form-input" min="0.05" max="50" step="0.1" value="' + coverageRadiusKm + '"></div>';
        html += '</div>';
        html += '<div id="editRadioBridgeSectorFields" style="' + (coverageShape === 'sector' ? '' : 'display:none;') + '">';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Длина луча, км</label>';
        html += '<input type="number" id="editRadioBridgeCoverageLength" class="form-input" min="0.05" max="50" step="0.1" value="' + coverageLengthKm + '"></div>';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Радиус (ширина на дальнем крае), км</label>';
        html += '<input type="number" id="editRadioBridgeCoverageRadiusSector" class="form-input" min="0" max="25" step="0.05" value="' + coverageRadiusKm + '"></div>';
        html += '<p style="font-size:0.75rem;color:var(--text-muted);margin:-4px 0 8px 0;">Луч от радиомоста: длина вдоль направления и ширина на дальней границе. Если радиус = 0 — используется угол сектора.</p>';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Азимут, ° (0 = север)</label>';
        html += '<input type="number" id="editRadioBridgeCoverageAzimuth" class="form-input" min="0" max="359" step="1" value="' + coverageAzimuth + '"></div>';
        html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Угол сектора, ° (если радиус = 0)</label>';
        html += '<input type="number" id="editRadioBridgeCoverageAngle" class="form-input" min="5" max="360" step="5" value="' + coverageAngle + '"></div>';
        html += '</div>';
    } else {
        html += '<div style="font-size: 0.875rem; color: var(--text-secondary);">';
        if (showCoverage) {
            if (coverageShape === 'sector') {
                html += 'Показано: луч, длина ' + formatCoverageKmLabel(coverageLengthKm) + ', радиус ' + formatCoverageKmLabel(coverageRadiusKm);
            } else {
                html += 'Показано: круг, ' + formatCoverageKmLabel(coverageRadiusKm);
            }
        } else {
            html += 'Не отображается';
        }
        html += '</div>';
    }
    html += '</div>';

    if (isRadioBridgePtp(obj)) {
        var peerId = obj.properties.get('peerBridgeId');
        var peerName = obj.properties.get('peerBridgeName') || '';
        html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Связь точка-точка</h4>';
        if (peerId) {
            html += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 10px;">Подключён к: <strong>' + escapeHtml(peerName || peerId) + '</strong></div>';
            if (isEdit) {
                html += '<button type="button" class="btn-radio-bridge-disconnect-ptp btn-secondary" style="width:100%;">Отключить радиолинк</button>';
            }
        } else if (isEdit) {
            var peers = getAvailablePtpLinkTargets(uid);
            if (peers.length) {
                html += '<div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Второй радиомост (P2P или P2MP)</label>';
                html += '<select id="radioBridgePtpPeerSelect" class="form-select">';
                peers.forEach(function(p) {
                    var pid = getObjectUniqueId(p);
                    html += '<option value="' + escapeHtml(pid) + '">' + escapeHtml(getPtpLinkTargetLabel(p)) + '</option>';
                });
                html += '</select></div>';
                html += '<button type="button" class="btn-radio-bridge-connect-ptp btn-primary" style="width:100%;">Задать маршрут и подключить</button>';
            } else {
                html += '<div style="font-size: 0.8125rem; color: var(--text-muted);">Нет свободных радиомостов для связи «точка-точка».</div>';
            }
        } else {
            html += '<div style="font-size: 0.875rem; color: var(--text-muted);">Не подключён</div>';
        }
        html += '</div>';
    }

    if (isRadioBridgeAp(obj)) {
        var ptpPeerLinks = getApPtpPeerLinks(obj);
        html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Радиомосты точка-точка (' + ptpPeerLinks.length + ')</h4>';
        if (ptpPeerLinks.length) {
            ptpPeerLinks.forEach(function(link, i) {
                if (!link) return;
                html += '<div class="radio-bridge-ptp-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
                html += '<span style="flex:1;font-size:0.875rem;">' + escapeHtml(link.peerName || ('P2P ' + (i + 1))) + '</span>';
                if (isEdit) {
                    html += '<button type="button" class="btn-radio-bridge-disconnect-ap-ptp btn-secondary" data-peer-id="' + escapeHtml(link.peerId || '') + '">Отключить</button>';
                }
                html += '</div>';
            });
        } else {
            html += '<div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 10px;">P2P-радиомосты не подключены</div>';
        }
        if (isEdit) {
            var ptpPeers = getAvailablePtpPeersForAp();
            if (ptpPeers.length) {
                html += '<div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Радиомост точка-точка</label>';
                html += '<select id="radioBridgeApPtpPeerSelect" class="form-select">';
                ptpPeers.forEach(function(p) {
                    var pid = getObjectUniqueId(p);
                    html += '<option value="' + escapeHtml(pid) + '">' + escapeHtml(p.properties.get('name') || 'Радиомост') + '</option>';
                });
                html += '</select></div>';
                html += '<button type="button" class="btn-radio-bridge-add-ptp btn-primary" style="width:100%;">Задать маршрут и подключить P2P</button>';
            } else {
                html += '<div style="font-size: 0.8125rem; color: var(--text-muted);">Нет свободных P2P-радиомостов.</div>';
            }
        }
        html += '</div>';
        var stationLinks = obj.properties.get('stationLinks') || [];
        html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Абонентские станции (' + stationLinks.length + ')</h4>';
        if (stationLinks.length) {
            stationLinks.forEach(function(link, i) {
                if (!link) return;
                html += '<div class="radio-bridge-station-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
                html += '<span style="flex:1;font-size:0.875rem;">' + escapeHtml(link.stationName || ('Станция ' + (i + 1))) + '</span>';
                if (isEdit) {
                    html += '<button type="button" class="btn-radio-bridge-disconnect-station btn-secondary" data-station-id="' + escapeHtml(link.stationId || '') + '">Отключить</button>';
                }
                html += '</div>';
            });
        } else {
            html += '<div style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 10px;">Станции не подключены</div>';
        }
        if (isEdit) {
            var stations = getAvailablePtmpStations(uid);
            if (stations.length) {
                html += '<div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Абонентская станция</label>';
                html += '<select id="radioBridgePtmpStationSelect" class="form-select">';
                stations.forEach(function(st) {
                    var sid = getObjectUniqueId(st);
                    var sname = st.properties.get('name') || 'Станция';
                    html += '<option value="' + escapeHtml(sid) + '">' + escapeHtml(sname) + '</option>';
                });
                html += '</select></div>';
                html += '<button type="button" class="btn-radio-bridge-add-station btn-primary" style="width:100%;">Задать маршрут и подключить станцию</button>';
            } else {
                html += '<div style="font-size: 0.8125rem; color: var(--text-muted);">Нет свободных абонентских станций.</div>';
            }
        }
        html += '</div>';
    }

    if (isRadioBridgeStation(obj)) {
        var ptpPeerIdSt = obj.properties.get('ptpPeerId');
        var ptpPeerNameSt = obj.properties.get('ptpPeerName') || '';
        if (ptpPeerIdSt) {
            html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Радиолинк точка-точка</h4>';
            html += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 10px;">Подключён к: <strong>' + escapeHtml(ptpPeerNameSt || ptpPeerIdSt) + '</strong></div>';
            if (isEdit) {
                html += '<button type="button" class="btn-radio-bridge-disconnect-ptp-peer btn-secondary" style="width:100%;">Отключить радиолинк</button>';
            }
            html += '</div>';
        }
        var apId = obj.properties.get('apBridgeId');
        var apName = obj.properties.get('apBridgeName') || '';
        html += '<div class="info-section" style="margin-bottom: 16px; padding: 14px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Подключение к базовой станции</h4>';
        if (apId) {
            html += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 10px;">Базовая станция: <strong>' + escapeHtml(apName || apId) + '</strong></div>';
            if (isEdit) {
                html += '<button type="button" class="btn-radio-bridge-disconnect-ap btn-secondary" style="width:100%;">Отключить от AP</button>';
            }
        } else if (isEdit && !ptpPeerIdSt) {
            var aps = getAvailablePtmpAps(uid);
            if (aps.length) {
                html += '<div class="form-group" style="margin-bottom: 10px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Базовая станция (AP)</label>';
                html += '<select id="radioBridgePtmpApSelect" class="form-select">';
                aps.forEach(function(ap) {
                    var aid = getObjectUniqueId(ap);
                    var aname = ap.properties.get('name') || 'Базовая станция';
                    html += '<option value="' + escapeHtml(aid) + '">' + escapeHtml(aname) + '</option>';
                });
                html += '</select></div>';
                html += '<button type="button" class="btn-radio-bridge-connect-ap btn-primary" style="width:100%;">Задать маршрут и подключить к AP</button>';
            } else {
                html += '<div style="font-size: 0.8125rem; color: var(--text-muted);">На карте нет базовых станций (AP).</div>';
            }
        } else {
            html += '<div style="font-size: 0.875rem; color: var(--text-muted);">Не подключена</div>';
        }
        html += '</div>';
    }

    return html;
}

function setupRadioBridgeCardHandlers() {
    function bindCoverageInputs() {
        var shapeSel = document.getElementById('editRadioBridgeCoverageShape');
        var sectorFields = document.getElementById('editRadioBridgeSectorFields');
        var circleFields = document.getElementById('editRadioBridgeCircleFields');
        if (shapeSel) {
            shapeSel.addEventListener('change', function() {
                var isSector = this.value === 'sector';
                if (sectorFields) sectorFields.style.display = isSector ? '' : 'none';
                if (circleFields) circleFields.style.display = isSector ? 'none' : '';
            });
        }
        ['editRadioBridgeShowCoverage', 'editRadioBridgeCoverageShape', 'editRadioBridgeCoverageRadius',
            'editRadioBridgeCoverageRadiusSector', 'editRadioBridgeCoverageLength',
            'editRadioBridgeCoverageAzimuth', 'editRadioBridgeCoverageAngle'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el || el._rbCovBound) return;
            el._rbCovBound = true;
            var evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(evt, function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge') return;
                var shape = document.getElementById('editRadioBridgeCoverageShape').value || 'circle';
                currentModalObject.properties.set('showCoverage', !!document.getElementById('editRadioBridgeShowCoverage').checked);
                currentModalObject.properties.set('coverageShape', shape);
                if (shape === 'sector') {
                    var lenEl = document.getElementById('editRadioBridgeCoverageLength');
                    var radSecEl = document.getElementById('editRadioBridgeCoverageRadiusSector');
                    currentModalObject.properties.set('coverageLengthKm', parseCoverageKm(lenEl && lenEl.value));
                    currentModalObject.properties.set('coverageRadiusKm', parseCoverageKm(radSecEl && radSecEl.value));
                } else {
                    currentModalObject.properties.set('coverageRadiusKm', parseCoverageKm(document.getElementById('editRadioBridgeCoverageRadius').value));
                }
                currentModalObject.properties.set('coverageRadiusM', null);
                currentModalObject.properties.set('coverageLengthM', null);
                currentModalObject.properties.set('coverageAzimuth', parseFloat(document.getElementById('editRadioBridgeCoverageAzimuth').value) || 0);
                currentModalObject.properties.set('coverageAngle', parseFloat(document.getElementById('editRadioBridgeCoverageAngle').value) || 60);
                applyRadioBridgeCoverageSettings(currentModalObject);
            });
        });
    }
    bindCoverageInputs();
    document.querySelectorAll('.btn-copper-connect-from-radio-bridge').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge') return;
            if (typeof startCopperCableFromRadioBridge === 'function') startCopperCableFromRadioBridge(currentModalObject);
        });
    });
    document.querySelectorAll('.btn-radio-bridge-disconnect-ap-ptp').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || !isRadioBridgeAp(currentModalObject)) return;
            var peerId = btn.getAttribute('data-peer-id');
            if (!peerId) return;
            disconnectApPtpPeer(currentModalObject, peerId);
            showObjectInfo(currentModalObject);
        });
    });
    document.querySelectorAll('.btn-radio-bridge-add-ptp').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || !isRadioBridgeAp(currentModalObject)) return;
            var sel = document.getElementById('radioBridgeApPtpPeerSelect');
            if (!sel || !sel.value) return;
            var ptp = getMapObjectByUid(sel.value, 'radioBridge');
            if (!ptp) return;
            startRadioBridgeRouting(ptp, currentModalObject, 'ptp');
        });
    });
    document.querySelectorAll('.btn-radio-bridge-disconnect-ptp-peer').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge') return;
            disconnectPtpPeerLink(currentModalObject);
            showObjectInfo(currentModalObject);
        });
    });
    document.querySelectorAll('.btn-radio-bridge-connect-ptp').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge') return;
            var sel = document.getElementById('radioBridgePtpPeerSelect');
            if (!sel || !sel.value) return;
            var peer = getMapObjectByUid(sel.value, 'radioBridge');
            if (!peer) return;
            startRadioBridgeRouting(currentModalObject, peer, 'ptp');
        });
    });
    document.querySelectorAll('.btn-radio-bridge-disconnect-ptp').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'radioBridge') return;
            disconnectPtpRadioBridge(currentModalObject);
            showObjectInfo(currentModalObject);
        });
    });
    document.querySelectorAll('.btn-radio-bridge-add-station').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || !isRadioBridgeAp(currentModalObject)) return;
            var sel = document.getElementById('radioBridgePtmpStationSelect');
            if (!sel || !sel.value) return;
            var station = getMapObjectByUid(sel.value, 'radioBridge');
            if (!station) return;
            startRadioBridgeRouting(currentModalObject, station, 'ptmp');
        });
    });
    document.querySelectorAll('.btn-radio-bridge-disconnect-station').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || !isRadioBridgeAp(currentModalObject)) return;
            var stId = btn.getAttribute('data-station-id');
            if (!stId) return;
            disconnectPtmpStation(currentModalObject, stId);
            showObjectInfo(currentModalObject);
        });
    });
    document.querySelectorAll('.btn-radio-bridge-connect-ap').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || !isRadioBridgeStation(currentModalObject)) return;
            var sel = document.getElementById('radioBridgePtmpApSelect');
            if (!sel || !sel.value) return;
            var ap = getMapObjectByUid(sel.value, 'radioBridge');
            if (!ap) return;
            startRadioBridgeRouting(ap, currentModalObject, 'ptmp');
        });
    });
    document.querySelectorAll('.btn-radio-bridge-disconnect-ap').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!currentModalObject || !isRadioBridgeStation(currentModalObject)) return;
            disconnectPtmpStationFromAp(currentModalObject);
            showObjectInfo(currentModalObject);
        });
    });
}
