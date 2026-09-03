/**
 * Зона захвата объектива камеры видеонаблюдения (круг / направленный луч).
 * Дальность — в метрах, максимум 200 м.
 */
var CAMERA_COVERAGE_COLOR = '#22a06b';
var CAMERA_COVERAGE_DEFAULT_M = 50;
var CAMERA_COVERAGE_MAX_M = 200;
var cameraCoverageOverlays = [];

function parseCameraCoverageMeters(val, fallbackM) {
    var fb = fallbackM != null ? fallbackM : CAMERA_COVERAGE_DEFAULT_M;
    var n = parseFloat(val);
    if (isNaN(n) || n < 0) return fb;
    if (n > CAMERA_COVERAGE_MAX_M) return CAMERA_COVERAGE_MAX_M;
    if (n > 0 && n < 1) return 1;
    return n;
}

function getCameraCoverageRadiusM(cam) {
    if (!cam || !cam.properties) return CAMERA_COVERAGE_DEFAULT_M;
    var m = cam.properties.get('coverageRadiusM');
    if (m != null && m !== '') return parseCameraCoverageMeters(m);
    return CAMERA_COVERAGE_DEFAULT_M;
}

function getCameraCoverageLengthM(cam) {
    if (!cam || !cam.properties) return getCameraCoverageRadiusM(cam);
    var m = cam.properties.get('coverageLengthM');
    if (m != null && m !== '') return parseCameraCoverageMeters(m);
    return getCameraCoverageRadiusM(cam);
}

function cameraCoverageDestinationPoint(center, distM, bearingDeg) {
    if (typeof rbDestinationPoint === 'function') {
        return rbDestinationPoint(center, distM, bearingDeg);
    }
    var R = 6378137;
    var lat1 = center[0] * Math.PI / 180;
    var lon1 = center[1] * Math.PI / 180;
    var brng = bearingDeg * Math.PI / 180;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(distM / R) + Math.cos(lat1) * Math.sin(distM / R) * Math.cos(brng));
    var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(distM / R) * Math.cos(lat1), Math.cos(distM / R) - Math.sin(lat1) * Math.sin(lat2));
    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

function buildCameraCoverageSectorRing(center, lengthM, azimuthDeg, angleDeg) {
    var start = azimuthDeg - angleDeg / 2;
    var end = azimuthDeg + angleDeg / 2;
    var steps = Math.max(36, Math.min(120, Math.ceil(angleDeg * 1.5 + lengthM / 50)));
    var ring = [center];
    for (var i = 0; i <= steps; i++) {
        ring.push(cameraCoverageDestinationPoint(center, lengthM, start + (end - start) * i / steps));
    }
    return ring;
}

function formatCameraCoverageMetersLabel(m) {
    var n = parseCameraCoverageMeters(m);
    if (Math.abs(n - Math.round(n)) < 0.05) return Math.round(n) + ' м';
    return (Math.round(n * 10) / 10) + ' м';
}

function buildCameraCoverageSummaryHtml(obj) {
    if (!obj || !obj.properties || !obj.properties.get('showCoverage')) {
        return 'Не отображается на карте';
    }
    var shape = obj.properties.get('coverageShape') || 'circle';
    if (shape === 'sector') {
        var lengthM = getCameraCoverageLengthM(obj);
        var angle = obj.properties.get('coverageAngle') != null ? obj.properties.get('coverageAngle') : 60;
        var az = obj.properties.get('coverageAzimuth') != null ? obj.properties.get('coverageAzimuth') : 0;
        return 'Прямая · ' + formatCameraCoverageMetersLabel(lengthM) + ' · угол ' + angle + '° · азимут ' + az + '°';
    }
    return 'Круговая · ' + formatCameraCoverageMetersLabel(getCameraCoverageRadiusM(obj));
}

function removeCameraCoverage(cam) {
    if (!cam || !cam.properties) return;
    var old = cam.properties.get('coverageOverlay');
    if (old) {
        try { if (myMap) myMap.geoObjects.remove(old); } catch (e) {}
        var idx = cameraCoverageOverlays.indexOf(old);
        if (idx >= 0) cameraCoverageOverlays.splice(idx, 1);
        cam.properties.set('coverageOverlay', null);
    }
}

function isCameraCoverageOwnerVisible(cam) {
    if (!cam || !cam.properties || cam.properties.get('type') !== 'camera') return false;
    if (!cam.properties.get('showCoverage')) return false;
    if (cam.properties.get('_mapFilterVisible') === false) return false;
    if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(cam)) return false;
    if (typeof getExpertZoomFlags === 'function') {
        var zf = getExpertZoomFlags();
        if (zf && zf.hideObjects) return false;
    }
    try {
        if (cam.options && cam.options.get('visible') === false) return false;
    } catch (eVis) {}
    if (window.MapRegions && MapRegions.isObjectInAnyHiddenRegion &&
        MapRegions.isObjectInAnyHiddenRegion(cam, typeof objects !== 'undefined' ? objects : null)) {
        return false;
    }
    return true;
}

function setCameraCoverageOverlaysVisible(cam, visible) {
    if (!cam || !cam.properties) return;
    var overlay = cam.properties.get('coverageOverlay');
    if (overlay && overlay.options) {
        try { overlay.options.set('visible', !!visible); } catch (e) {}
    }
}

function applyCameraCoverageVisibility(camOrNull) {
    if (window._mapPdfExportCaptureActive) return;
    function syncOne(cam) {
        if (!cam || !cam.properties || cam.properties.get('type') !== 'camera') return;
        if (!cam.properties.get('coverageOverlay')) return;
        setCameraCoverageOverlaysVisible(cam, isCameraCoverageOwnerVisible(cam));
    }
    if (camOrNull) {
        syncOne(camOrNull);
        return;
    }
    if (!Array.isArray(objects)) return;
    objects.forEach(syncOne);
}

function updateCameraCoverage(cam) {
    removeCameraCoverage(cam);
    if (!cam || !cam.properties || cam.properties.get('type') !== 'camera') return;
    if (!cam.properties.get('showCoverage') || !cam.geometry || !myMap) return;
    var center = cam.geometry.getCoordinates();
    if (!center || center.length < 2) return;
    var radiusM = getCameraCoverageRadiusM(cam);
    var lengthM = getCameraCoverageLengthM(cam);
    var shape = cam.properties.get('coverageShape') || 'circle';
    var style = {
        fillColor: CAMERA_COVERAGE_COLOR,
        fillOpacity: 0.14,
        strokeColor: CAMERA_COVERAGE_COLOR,
        strokeWidth: 2,
        strokeOpacity: 0.5,
        zIndex: 88,
        interactive: false
    };
    var overlay;
    if (shape === 'sector') {
        var az = parseFloat(cam.properties.get('coverageAzimuth')) || 0;
        var angle = parseFloat(cam.properties.get('coverageAngle')) || 60;
        overlay = new ymaps.Polygon([buildCameraCoverageSectorRing(center, lengthM, az, angle)], {}, style);
    } else {
        overlay = new ymaps.Circle([center, radiusM], {}, style);
    }
    overlay.properties.set('type', 'cameraCoverage');
    overlay.properties.set('ownerId', typeof getObjectUniqueId === 'function' ? getObjectUniqueId(cam) : null);
    cam.properties.set('coverageOverlay', overlay);
    cameraCoverageOverlays.push(overlay);
    myMap.geoObjects.add(overlay);
    applyCameraCoverageVisibility(cam);
}

function updateAllCameraCoverages() {
    cameraCoverageOverlays.forEach(function(o) {
        try { if (myMap) myMap.geoObjects.remove(o); } catch (e) {}
    });
    cameraCoverageOverlays = [];
    if (!Array.isArray(objects)) return;
    objects.forEach(function(o) {
        if (o.properties && o.properties.get('type') === 'camera') {
            o.properties.set('coverageOverlay', null);
            updateCameraCoverage(o);
        }
    });
    applyCameraCoverageVisibility();
}

function applyCameraCoverageSettings(cam) {
    if (!cam || !cam.properties) return;
    updateCameraCoverage(cam);
    if (typeof saveData === 'function') saveData({ object: cam, syncImmediate: true });
}

function buildCameraCoverageSectionHtml(obj, isEditMode) {
    if (!obj || !obj.properties) return '';
    var showCoverage = !!obj.properties.get('showCoverage');
    var coverageShape = obj.properties.get('coverageShape') || 'circle';
    var coverageRadiusM = getCameraCoverageRadiusM(obj);
    var coverageLengthM = getCameraCoverageLengthM(obj);
    var coverageAzimuth = obj.properties.get('coverageAzimuth') != null ? obj.properties.get('coverageAzimuth') : 0;
    var coverageAngle = obj.properties.get('coverageAngle') != null ? obj.properties.get('coverageAngle') : 60;
    var html = '<section class="object-card-section object-card-section--coverage">';
    html += '<h4 class="object-card-section-title">Зона обзора объектива</h4>';
    if (isEditMode) {
        html += '<label class="radio-bridge-coverage-toggle"><input type="checkbox" id="editCameraShowCoverage"' + (showCoverage ? ' checked' : '') + '> Показывать на карте</label>';
        html += '<div id="editCameraCoverageParams" class="radio-bridge-coverage-params"' + (showCoverage ? '' : ' style="display:none;"') + '>';
        html += '<div class="form-group"><label for="editCameraCoverageShape" class="object-card-label">Форма</label>';
        html += '<select id="editCameraCoverageShape" class="form-select">';
        html += '<option value="circle"' + (coverageShape === 'circle' ? ' selected' : '') + '>Круговая</option>';
        html += '<option value="sector"' + (coverageShape === 'sector' ? ' selected' : '') + '>Прямая (луч)</option>';
        html += '</select></div>';
        html += '<div id="editCameraCircleFields" class="radio-bridge-coverage-fields"' + (coverageShape === 'circle' ? '' : ' style="display:none;"') + '>';
        html += '<div class="form-group"><label for="editCameraCoverageRadius" class="object-card-label">Радиус, м</label>';
        html += '<input type="number" id="editCameraCoverageRadius" class="form-input" min="1" max="' + CAMERA_COVERAGE_MAX_M + '" step="1" value="' + coverageRadiusM + '"></div>';
        html += '</div>';
        html += '<div id="editCameraSectorFields" class="radio-bridge-coverage-fields"' + (coverageShape === 'sector' ? '' : ' style="display:none;"') + '>';
        html += '<div class="form-group"><label for="editCameraCoverageLength" class="object-card-label">Дальность, м</label>';
        html += '<input type="number" id="editCameraCoverageLength" class="form-input" min="1" max="' + CAMERA_COVERAGE_MAX_M + '" step="1" value="' + coverageLengthM + '"></div>';
        html += '<div class="radio-bridge-coverage-grid">';
        html += '<div class="form-group"><label for="editCameraCoverageAzimuth" class="object-card-label">Азимут, °</label>';
        html += '<input type="number" id="editCameraCoverageAzimuth" class="form-input" min="0" max="359" step="1" value="' + coverageAzimuth + '"></div>';
        html += '<div class="form-group"><label for="editCameraCoverageAngle" class="object-card-label">Угол обзора, °</label>';
        html += '<input type="number" id="editCameraCoverageAngle" class="form-input" min="5" max="360" step="5" value="' + coverageAngle + '"></div>';
        html += '</div>';
        html += '<p class="object-card-hint radio-bridge-coverage-hint">0° — север, 90° — восток. Максимум ' + CAMERA_COVERAGE_MAX_M + ' м.</p>';
        html += '</div>';
        html += '</div>';
    } else {
        html += '<div class="radio-bridge-coverage-summary">' + escapeHtml(buildCameraCoverageSummaryHtml(obj)) + '</div>';
    }
    html += '</section>';
    return html;
}

function setupCameraCoverageCardHandlers() {
    var shapeSel = document.getElementById('editCameraCoverageShape');
    var sectorFields = document.getElementById('editCameraSectorFields');
    var circleFields = document.getElementById('editCameraCircleFields');
    var coverageParams = document.getElementById('editCameraCoverageParams');
    var showCoverageEl = document.getElementById('editCameraShowCoverage');

    function syncCoverageParamsVisibility() {
        if (coverageParams && showCoverageEl) {
            coverageParams.style.display = showCoverageEl.checked ? '' : 'none';
        }
    }

    if (shapeSel && !shapeSel._camCovShapeBound) {
        shapeSel._camCovShapeBound = true;
        shapeSel.addEventListener('change', function() {
            var isSector = this.value === 'sector';
            if (sectorFields) sectorFields.style.display = isSector ? '' : 'none';
            if (circleFields) circleFields.style.display = isSector ? 'none' : '';
        });
    }
    if (showCoverageEl && !showCoverageEl._camCovVisBound) {
        showCoverageEl._camCovVisBound = true;
        showCoverageEl.addEventListener('change', syncCoverageParamsVisibility);
    }
    syncCoverageParamsVisibility();

    ['editCameraShowCoverage', 'editCameraCoverageShape', 'editCameraCoverageRadius',
        'editCameraCoverageLength', 'editCameraCoverageAzimuth', 'editCameraCoverageAngle'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el || el._camCovBound) return;
        el._camCovBound = true;
        var evt = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'camera') return;
            var shapeEl = document.getElementById('editCameraCoverageShape');
            var shape = (shapeEl && shapeEl.value) || 'circle';
            var showEl = document.getElementById('editCameraShowCoverage');
            currentModalObject.properties.set('showCoverage', !!(showEl && showEl.checked));
            currentModalObject.properties.set('coverageShape', shape);
            if (shape === 'sector') {
                var lenEl = document.getElementById('editCameraCoverageLength');
                currentModalObject.properties.set('coverageLengthM', parseCameraCoverageMeters(lenEl && lenEl.value));
            } else {
                var radEl = document.getElementById('editCameraCoverageRadius');
                currentModalObject.properties.set('coverageRadiusM', parseCameraCoverageMeters(radEl && radEl.value));
            }
            var azEl = document.getElementById('editCameraCoverageAzimuth');
            var angEl = document.getElementById('editCameraCoverageAngle');
            var az = parseFloat(azEl && azEl.value);
            var ang = parseFloat(angEl && angEl.value);
            if (isNaN(az)) az = 0;
            if (az < 0) az = 0;
            if (az > 359) az = 359;
            if (isNaN(ang) || ang < 5) ang = 60;
            if (ang > 360) ang = 360;
            currentModalObject.properties.set('coverageAzimuth', az);
            currentModalObject.properties.set('coverageAngle', ang);
            applyCameraCoverageSettings(currentModalObject);
        });
    });
}
