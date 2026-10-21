/**
 * Виртуальный джойстик (мышь / touch) для настройки направления и охвата
 * зоны камеры / радиомоста: азимут, дальность, угол сектора.
 *
 * 0° — север (вверх), 90° — восток (вправо).
 */
(function(global) {
    'use strict';

    var PAD_R = 72;
    var KNOB_R = 11;
    var EDGE_HIT = 14;

    function clamp(n, min, max) {
        if (isNaN(n)) return min;
        if (n < min) return min;
        if (n > max) return max;
        return n;
    }

    function normalizeAzimuth(deg) {
        var a = deg % 360;
        if (a < 0) a += 360;
        return Math.round(a) % 360;
    }

    function snapAngle(deg) {
        return Math.round(clamp(deg, 5, 360) / 5) * 5;
    }

    function formatRange(value, unit) {
        var n = Number(value);
        if (isNaN(n)) n = 0;
        if (unit === 'км') {
            if (Math.abs(n - Math.round(n)) < 0.001) return Math.round(n) + ' км';
            return (Math.round(n * 100) / 100) + ' км';
        }
        if (Math.abs(n - Math.round(n)) < 0.05) return Math.round(n) + ' м';
        return (Math.round(n * 10) / 10) + ' м';
    }

    function polarToXY(azimuthDeg, t, maxR) {
        var rad = (azimuthDeg - 90) * Math.PI / 180;
        var r = clamp(t, 0, 1) * maxR;
        return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
    }

    function xyToPolar(x, y, maxR) {
        var dist = Math.sqrt(x * x + y * y);
        var t = maxR > 0 ? clamp(dist / maxR, 0, 1) : 0;
        var screenDeg = Math.atan2(y, x) * 180 / Math.PI;
        var az = normalizeAzimuth(screenDeg + 90);
        return { azimuth: az, t: t };
    }

    function rangeToT(range, min, max) {
        if (max <= min) return 0;
        return clamp((range - min) / (max - min), 0, 1);
    }

    function tToRange(t, min, max, step) {
        var v = min + clamp(t, 0, 1) * (max - min);
        if (step && step > 0) {
            v = Math.round(v / step) * step;
        }
        return clamp(v, min, max);
    }

    /**
     * @param {object} opts
     * @param {string} opts.idPrefix
     * @param {'circle'|'sector'} opts.shape
     * @param {number} opts.azimuth
     * @param {number} opts.angle
     * @param {number} opts.range
     * @param {number} opts.rangeMin
     * @param {number} opts.rangeMax
     * @param {number} [opts.rangeStep]
     * @param {string} opts.rangeUnit  'м' | 'км'
     * @param {string} [opts.accent]
     * @param {string} [opts.rangeLabel] подпись дальности
     */
    function buildCoverageJoystickHtml(opts) {
        var p = opts.idPrefix || 'covJoy';
        var shape = opts.shape === 'sector' ? 'sector' : 'circle';
        var az = normalizeAzimuth(opts.azimuth != null ? opts.azimuth : 0);
        var angle = snapAngle(opts.angle != null ? opts.angle : 60);
        var rangeMin = opts.rangeMin != null ? opts.rangeMin : 1;
        var rangeMax = opts.rangeMax != null ? opts.rangeMax : 100;
        var rangeStep = opts.rangeStep != null ? opts.rangeStep : 1;
        var range = clamp(opts.range != null ? opts.range : rangeMin, rangeMin, rangeMax);
        var unit = opts.rangeUnit || 'м';
        var accent = opts.accent || 'var(--accent-primary)';
        var rangeLabel = opts.rangeLabel || (unit === 'км' ? 'Дальность' : 'Дальность');
        var size = (PAD_R + 28) * 2;
        var cx = size / 2;
        var cy = size / 2;

        var html = '<div class="coverage-joystick" id="' + p + 'Root"';
        html += ' data-shape="' + shape + '"';
        html += ' data-range-min="' + rangeMin + '"';
        html += ' data-range-max="' + rangeMax + '"';
        html += ' data-range-step="' + rangeStep + '"';
        html += ' data-range-unit="' + escapeAttr(unit) + '"';
        html += ' data-accent="' + escapeAttr(accent) + '"';
        html += ' style="--cov-joy-accent:' + accent + ';">';

        html += '<div class="coverage-joystick-pad-wrap">';
        html += '<svg class="coverage-joystick-svg" id="' + p + 'Svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="Джойстик направления и охвата">';
        html += '<defs>';
        html += '<radialGradient id="' + p + 'PadGrad" cx="50%" cy="50%" r="50%">';
        html += '<stop offset="0%" stop-color="color-mix(in srgb, var(--cov-joy-accent) 18%, transparent)"/>';
        html += '<stop offset="100%" stop-color="transparent"/>';
        html += '</radialGradient>';
        html += '</defs>';

        html += '<circle class="coverage-joystick-pad" cx="' + cx + '" cy="' + cy + '" r="' + PAD_R + '" fill="url(#' + p + 'PadGrad)"/>';
        html += '<circle class="coverage-joystick-ring" cx="' + cx + '" cy="' + cy + '" r="' + PAD_R + '" fill="none"/>';
        html += '<circle class="coverage-joystick-ring coverage-joystick-ring--mid" cx="' + cx + '" cy="' + cy + '" r="' + (PAD_R * 0.55) + '" fill="none"/>';

        // Compass ticks / labels
        html += '<g class="coverage-joystick-compass">';
        [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(function(pair) {
            var label = pair[0];
            var a = pair[1];
            var pt = polarToXY(a, 1, PAD_R + 14);
            html += '<text class="coverage-joystick-compass-label" x="' + (cx + pt.x) + '" y="' + (cy + pt.y) + '" text-anchor="middle" dominant-baseline="central">' + label + '</text>';
        });
        html += '</g>';

        html += '<path class="coverage-joystick-wedge" id="' + p + 'Wedge" d=""/>';
        html += '<circle class="coverage-joystick-disk" id="' + p + 'Disk" cx="' + cx + '" cy="' + cy + '" r="0"/>';

        html += '<line class="coverage-joystick-beam" id="' + p + 'Beam" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - PAD_R) + '"/>';

        html += '<circle class="coverage-joystick-edge" id="' + p + 'EdgeL" cx="0" cy="0" r="6"/>';
        html += '<circle class="coverage-joystick-edge" id="' + p + 'EdgeR" cx="0" cy="0" r="6"/>';

        html += '<circle class="coverage-joystick-center" cx="' + cx + '" cy="' + cy + '" r="3.5"/>';
        html += '<circle class="coverage-joystick-knob" id="' + p + 'Knob" cx="' + cx + '" cy="' + (cy - 20) + '" r="' + KNOB_R + '"/>';
        html += '</svg>';

        html += '<div class="coverage-joystick-hint" id="' + p + 'Hint">';
        html += shape === 'sector'
            ? 'Ручка / поля ниже. Края и колёсико — угол.'
            : 'Ручка или поле ниже — радиус.';
        html += '</div>';
        html += '</div>';

        html += '<div class="coverage-joystick-fields" id="' + p + 'Fields">';
        html += buildCoverageJoystickFieldHtml({
            id: p + 'Azimuth',
            fieldClass: 'coverage-joystick-field--azimuth',
            label: 'Азимут',
            value: az,
            min: 0,
            max: 359,
            step: 1,
            unit: '°',
            inputmode: 'numeric',
            ariaLabel: 'Азимут, градусы'
        });
        html += buildCoverageJoystickFieldHtml({
            id: p + 'Range',
            fieldClass: 'coverage-joystick-field--range',
            label: rangeLabel,
            labelId: p + 'RangeLabel',
            value: range,
            min: rangeMin,
            max: rangeMax,
            step: rangeStep,
            unit: unit,
            inputmode: 'decimal',
            dataLabel: rangeLabel,
            ariaLabel: rangeLabel + ', ' + unit
        });
        html += buildCoverageJoystickFieldHtml({
            id: p + 'Angle',
            fieldClass: 'coverage-joystick-field--angle',
            label: 'Угол',
            value: angle,
            min: 5,
            max: 360,
            step: 5,
            unit: '°',
            inputmode: 'numeric',
            ariaLabel: 'Угол сектора, градусы'
        });
        html += '</div>';

        html += '<div class="coverage-joystick-readout visually-hidden" id="' + p + 'Readout" aria-live="polite"></div>';

        html += '</div>';
        return html;
    }

    function buildCoverageJoystickFieldHtml(cfg) {
        var html = '<div class="coverage-joystick-field ' + (cfg.fieldClass || '') + '">';
        html += '<label class="coverage-joystick-field__label"' + (cfg.labelId ? ' id="' + cfg.labelId + '"' : '') +
            ' for="' + cfg.id + '">' + escapeAttr(cfg.label) +
            ' <span class="coverage-joystick-field__unit">' + escapeAttr(cfg.unit) + '</span></label>';
        html += '<div class="coverage-joystick-stepper">';
        html += '<button type="button" class="coverage-joystick-stepper__btn" data-step-for="' + cfg.id + '" data-dir="-1" tabindex="-1" title="Уменьшить" aria-label="Уменьшить ' + escapeAttr(cfg.label) + '">';
        html += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14"/></svg>';
        html += '</button>';
        html += '<input type="number" class="form-input coverage-joystick-field__input" id="' + cfg.id + '"';
        html += ' min="' + cfg.min + '" max="' + cfg.max + '" step="' + cfg.step + '" value="' + cfg.value + '"';
        html += ' inputmode="' + (cfg.inputmode || 'numeric') + '" aria-label="' + escapeAttr(cfg.ariaLabel || cfg.label) + '"';
        if (cfg.dataLabel) html += ' data-label="' + escapeAttr(cfg.dataLabel) + '"';
        html += '>';
        html += '<button type="button" class="coverage-joystick-stepper__btn" data-step-for="' + cfg.id + '" data-dir="1" tabindex="-1" title="Увеличить" aria-label="Увеличить ' + escapeAttr(cfg.label) + '">';
        html += '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
        html += '</button>';
        html += '</div></div>';
        return html;
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function wedgePath(cx, cy, azimuth, angle, t) {
        var half = angle / 2;
        var start = azimuth - half;
        var end = azimuth + half;
        var r = Math.max(4, clamp(t, 0, 1) * PAD_R);
        var steps = Math.max(8, Math.ceil(angle / 6));
        var d = 'M ' + cx + ' ' + cy;
        for (var i = 0; i <= steps; i++) {
            var a = start + (end - start) * i / steps;
            var pt = polarToXY(a, r / PAD_R, PAD_R);
            d += ' L ' + (cx + pt.x) + ' ' + (cy + pt.y);
        }
        d += ' Z';
        return d;
    }

    function updateVisual(state) {
        var p = state.prefix;
        var size = (PAD_R + 28) * 2;
        var cx = size / 2;
        var cy = size / 2;
        var t = rangeToT(state.range, state.rangeMin, state.rangeMax);
        var knob = polarToXY(state.azimuth, Math.max(t, 0.12), PAD_R);
        var knobEl = document.getElementById(p + 'Knob');
        var beamEl = document.getElementById(p + 'Beam');
        var wedgeEl = document.getElementById(p + 'Wedge');
        var diskEl = document.getElementById(p + 'Disk');
        var edgeL = document.getElementById(p + 'EdgeL');
        var edgeR = document.getElementById(p + 'EdgeR');
        var readout = document.getElementById(p + 'Readout');
        var root = document.getElementById(p + 'Root');
        var hint = document.getElementById(p + 'Hint');

        if (knobEl) {
            knobEl.setAttribute('cx', cx + knob.x);
            knobEl.setAttribute('cy', cy + knob.y);
        }
        if (beamEl) {
            var tip = polarToXY(state.azimuth, Math.max(t, 0.08), PAD_R);
            beamEl.setAttribute('x2', cx + tip.x);
            beamEl.setAttribute('y2', cy + tip.y);
            beamEl.style.display = state.shape === 'sector' ? '' : 'none';
        }
        if (wedgeEl) {
            if (state.shape === 'sector') {
                wedgeEl.setAttribute('d', wedgePath(cx, cy, state.azimuth, state.angle, Math.max(t, 0.2)));
                wedgeEl.style.display = '';
            } else {
                wedgeEl.style.display = 'none';
            }
        }
        if (diskEl) {
            if (state.shape === 'circle') {
                diskEl.setAttribute('r', Math.max(4, t * PAD_R));
                diskEl.style.display = '';
            } else {
                diskEl.style.display = 'none';
            }
        }
        if (edgeL && edgeR) {
            if (state.shape === 'sector') {
                var half = state.angle / 2;
                var el = polarToXY(state.azimuth - half, Math.max(t, 0.55), PAD_R);
                var er = polarToXY(state.azimuth + half, Math.max(t, 0.55), PAD_R);
                edgeL.setAttribute('cx', cx + el.x);
                edgeL.setAttribute('cy', cy + el.y);
                edgeR.setAttribute('cx', cx + er.x);
                edgeR.setAttribute('cy', cy + er.y);
                edgeL.style.display = '';
                edgeR.style.display = '';
            } else {
                edgeL.style.display = 'none';
                edgeR.style.display = 'none';
            }
        }
        if (root) root.setAttribute('data-shape', state.shape);
        if (hint) {
            hint.textContent = state.shape === 'sector'
                ? 'Ручка / поля ниже. Края и колёсико — угол.'
                : 'Ручка или поле ниже — радиус.';
        }
        if (readout) {
            if (state.shape === 'sector') {
                readout.innerHTML =
                    '<span><em>Азимут</em> ' + state.azimuth + '°</span>' +
                    '<span><em>' + (state.rangeLabel || 'Дальность') + '</em> ' + formatRange(state.range, state.rangeUnit) + '</span>' +
                    '<span><em>Угол</em> ' + state.angle + '°</span>';
            } else {
                readout.innerHTML =
                    '<span><em>Радиус</em> ' + formatRange(state.range, state.rangeUnit) + '</span>';
            }
        }

        var azEl = document.getElementById(p + 'Azimuth');
        var angEl = document.getElementById(p + 'Angle');
        var rngEl = document.getElementById(p + 'Range');
        var rangeLabelEl = document.getElementById(p + 'RangeLabel');
        var fields = document.getElementById(p + 'Fields');
        if (azEl && document.activeElement !== azEl) azEl.value = String(state.azimuth);
        if (angEl && document.activeElement !== angEl) angEl.value = String(state.angle);
        if (rngEl && document.activeElement !== rngEl) {
            rngEl.value = String(state.range);
            if (state.rangeLabel) rngEl.setAttribute('data-label', state.rangeLabel);
        }
        if (rangeLabelEl) {
            var labelText = state.shape === 'circle' ? 'Радиус' : (state.rangeLabel || 'Дальность');
            var unitSpan = rangeLabelEl.querySelector('.coverage-joystick-field__unit');
            var unitText = unitSpan ? unitSpan.textContent : (state.rangeUnit || '');
            rangeLabelEl.textContent = '';
            rangeLabelEl.appendChild(document.createTextNode(labelText + ' '));
            var unitEl = document.createElement('span');
            unitEl.className = 'coverage-joystick-field__unit';
            unitEl.textContent = unitText;
            rangeLabelEl.appendChild(unitEl);
        }
        if (fields) {
            fields.classList.toggle('coverage-joystick-fields--circle', state.shape === 'circle');
            fields.classList.toggle('coverage-joystick-fields--sector', state.shape === 'sector');
        }
    }

    function readStateFromDom(prefix) {
        var root = document.getElementById(prefix + 'Root');
        if (!root) return null;
        var rangeLabelEl = document.getElementById(prefix + 'Range');
        return {
            prefix: prefix,
            shape: root.getAttribute('data-shape') || 'circle',
            rangeMin: parseFloat(root.getAttribute('data-range-min')) || 0,
            rangeMax: parseFloat(root.getAttribute('data-range-max')) || 100,
            rangeStep: parseFloat(root.getAttribute('data-range-step')) || 1,
            rangeUnit: root.getAttribute('data-range-unit') || 'м',
            rangeLabel: (rangeLabelEl && rangeLabelEl.getAttribute('data-label')) || 'Дальность',
            azimuth: parseFloat((document.getElementById(prefix + 'Azimuth') || {}).value) || 0,
            angle: parseFloat((document.getElementById(prefix + 'Angle') || {}).value) || 60,
            range: parseFloat((document.getElementById(prefix + 'Range') || {}).value) || 0
        };
    }

    function hitTest(svg, clientX, clientY, state) {
        var rect = svg.getBoundingClientRect();
        var size = (PAD_R + 28) * 2;
        var scaleX = size / Math.max(rect.width, 1);
        var scaleY = size / Math.max(rect.height, 1);
        var x = (clientX - rect.left) * scaleX;
        var y = (clientY - rect.top) * scaleY;
        var cx = size / 2;
        var cy = size / 2;
        var lx = x - cx;
        var ly = y - cy;

        if (state.shape === 'sector') {
            var t = Math.max(rangeToT(state.range, state.rangeMin, state.rangeMax), 0.55);
            var half = state.angle / 2;
            var el = polarToXY(state.azimuth - half, t, PAD_R);
            var er = polarToXY(state.azimuth + half, t, PAD_R);
            if ((lx - el.x) * (lx - el.x) + (ly - el.y) * (ly - el.y) <= EDGE_HIT * EDGE_HIT) {
                return { mode: 'edge', side: 'l', x: lx, y: ly };
            }
            if ((lx - er.x) * (lx - er.x) + (ly - er.y) * (ly - er.y) <= EDGE_HIT * EDGE_HIT) {
                return { mode: 'edge', side: 'r', x: lx, y: ly };
            }
        }
        return { mode: 'stick', x: lx, y: ly };
    }

    /**
     * @param {object} opts
     * @param {string} opts.idPrefix
     * @param {function} [opts.getShape] () => 'circle'|'sector'
     * @param {function} opts.onChange ({azimuth, angle, range, shape}) => void
     */
    function setupCoverageJoystick(opts) {
        var prefix = opts.idPrefix;
        var root = document.getElementById(prefix + 'Root');
        var svg = document.getElementById(prefix + 'Svg');
        if (!root || !svg || root._covJoyBound) return null;
        root._covJoyBound = true;

        var state = readStateFromDom(prefix);
        if (!state) return null;
        if (typeof opts.getShape === 'function') {
            state.shape = opts.getShape() === 'sector' ? 'sector' : 'circle';
        }
        updateVisual(state);

        var drag = null;

        function emit() {
            if (typeof opts.onChange === 'function') {
                opts.onChange({
                    azimuth: state.azimuth,
                    angle: state.angle,
                    range: state.range,
                    shape: state.shape
                });
            }
        }

        function applyStick(lx, ly, emitNow) {
            var polar = xyToPolar(lx, ly, PAD_R);
            // У центра азимут нестабилен — сохраняем прежний
            if (polar.t > 0.06) {
                state.azimuth = polar.azimuth;
            }
            state.range = tToRange(polar.t, state.rangeMin, state.rangeMax, state.rangeStep);
            if (state.range < state.rangeMin) state.range = state.rangeMin;
            updateVisual(state);
            if (emitNow) emit();
        }

        function applyEdge(lx, ly, side, emitNow) {
            var polar = xyToPolar(lx, ly, PAD_R);
            var delta = polar.azimuth - state.azimuth;
            while (delta > 180) delta -= 360;
            while (delta < -180) delta += 360;
            var half = Math.abs(delta);
            state.angle = snapAngle(half * 2);
            updateVisual(state);
            if (emitNow) emit();
        }

        function onPointerDown(e) {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            if (typeof opts.getShape === 'function') {
                state.shape = opts.getShape() === 'sector' ? 'sector' : 'circle';
            }
            var hit = hitTest(svg, e.clientX, e.clientY, state);
            drag = { mode: hit.mode, side: hit.side, pointerId: e.pointerId };
            try { svg.setPointerCapture(e.pointerId); } catch (err) {}
            root.classList.add('is-dragging');
            if (hit.mode === 'edge') applyEdge(hit.x, hit.y, hit.side, true);
            else applyStick(hit.x, hit.y, true);
        }

        function onPointerMove(e) {
            if (!drag) return;
            e.preventDefault();
            var hit = hitTest(svg, e.clientX, e.clientY, state);
            if (drag.mode === 'edge') applyEdge(hit.x, hit.y, drag.side, true);
            else applyStick(hit.x, hit.y, true);
        }

        function onPointerUp(e) {
            if (!drag) return;
            if (e.pointerId != null && drag.pointerId != null && e.pointerId !== drag.pointerId) return;
            drag = null;
            root.classList.remove('is-dragging');
            try { svg.releasePointerCapture(e.pointerId); } catch (err) {}
            emit();
        }

        function onWheel(e) {
            if (state.shape !== 'sector') return;
            e.preventDefault();
            var dir = e.deltaY > 0 ? 5 : -5;
            state.angle = snapAngle(state.angle + dir);
            updateVisual(state);
            emit();
        }

        function applyFromAzimuthInput(raw, finalize) {
            var n = parseFloat(raw);
            if (isNaN(n)) {
                if (finalize) {
                    state.azimuth = normalizeAzimuth(state.azimuth);
                    updateVisual(state);
                    emit();
                }
                return;
            }
            state.azimuth = finalize ? normalizeAzimuth(n) : normalizeAzimuth(Math.round(n));
            updateVisual(state);
            emit();
        }

        function applyFromAngleInput(raw, finalize) {
            var n = parseFloat(raw);
            if (isNaN(n)) {
                if (finalize) {
                    state.angle = snapAngle(state.angle);
                    updateVisual(state);
                    emit();
                }
                return;
            }
            state.angle = finalize ? snapAngle(n) : clamp(Math.round(n), 5, 360);
            updateVisual(state);
            emit();
        }

        function applyFromRangeInput(raw, finalize) {
            var n = parseFloat(String(raw).replace(',', '.'));
            if (isNaN(n)) {
                if (finalize) {
                    state.range = clamp(state.range, state.rangeMin, state.rangeMax);
                    updateVisual(state);
                    emit();
                }
                return;
            }
            if (finalize && state.rangeStep > 0) {
                n = Math.round(n / state.rangeStep) * state.rangeStep;
            }
            state.range = clamp(n, state.rangeMin, state.rangeMax);
            updateVisual(state);
            emit();
        }

        function bindNumberField(el, onInput, onCommit) {
            if (!el || el._covJoyFieldBound) return;
            el._covJoyFieldBound = true;
            el.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
            el.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            el.addEventListener('click', function(e) { e.stopPropagation(); });
            el.addEventListener('keydown', function(e) {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommit(el.value);
                    el.blur();
                }
            });
            el.addEventListener('input', function() { onInput(el.value); });
            el.addEventListener('change', function() { onCommit(el.value); });
            el.addEventListener('blur', function() { onCommit(el.value); });
        }

        var azInput = document.getElementById(prefix + 'Azimuth');
        var angInput = document.getElementById(prefix + 'Angle');
        var rngInput = document.getElementById(prefix + 'Range');
        bindNumberField(azInput,
            function(v) { applyFromAzimuthInput(v, false); },
            function(v) { applyFromAzimuthInput(v, true); }
        );
        bindNumberField(angInput,
            function(v) { applyFromAngleInput(v, false); },
            function(v) { applyFromAngleInput(v, true); }
        );
        bindNumberField(rngInput,
            function(v) { applyFromRangeInput(v, false); },
            function(v) { applyFromRangeInput(v, true); }
        );

        function stepFieldByDir(inputId, dir) {
            if (inputId === prefix + 'Azimuth') {
                state.azimuth = normalizeAzimuth(state.azimuth + dir);
                updateVisual(state);
                emit();
                return;
            }
            if (inputId === prefix + 'Angle') {
                state.angle = snapAngle(state.angle + dir * 5);
                updateVisual(state);
                emit();
                return;
            }
            if (inputId === prefix + 'Range') {
                var step = state.rangeStep > 0 ? state.rangeStep : 1;
                var next = state.range + dir * step;
                if (step >= 1) next = Math.round(next / step) * step;
                else next = Math.round(next / step) * step;
                // Avoid float noise for 0.1 km steps
                next = Math.round(next * 1000) / 1000;
                state.range = clamp(next, state.rangeMin, state.rangeMax);
                updateVisual(state);
                emit();
            }
        }

        function bindStepperButtons() {
            if (!root || root._covJoyStepperBound) return;
            root._covJoyStepperBound = true;
            var holdTimer = null;
            var holdInterval = null;
            var activeBtn = null;

            function clearHold() {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                if (holdInterval) {
                    clearInterval(holdInterval);
                    holdInterval = null;
                }
                if (activeBtn) {
                    activeBtn.classList.remove('is-active');
                    activeBtn = null;
                }
            }

            function startHold(btn, inputId, dir) {
                clearHold();
                activeBtn = btn;
                btn.classList.add('is-active');
                stepFieldByDir(inputId, dir);
                holdTimer = setTimeout(function() {
                    holdInterval = setInterval(function() {
                        stepFieldByDir(inputId, dir);
                    }, 70);
                }, 380);
            }

            root.querySelectorAll('.coverage-joystick-stepper__btn').forEach(function(btn) {
                btn.addEventListener('pointerdown', function(e) {
                    if (e.button != null && e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    var inputId = btn.getAttribute('data-step-for');
                    var dir = parseInt(btn.getAttribute('data-dir'), 10) || 1;
                    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
                    startHold(btn, inputId, dir);
                });
                btn.addEventListener('pointerup', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    clearHold();
                    try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
                });
                btn.addEventListener('pointercancel', clearHold);
                btn.addEventListener('pointerleave', function() {
                    if (activeBtn === btn) clearHold();
                });
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });
        }
        bindStepperButtons();

        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
        svg.addEventListener('pointercancel', onPointerUp);
        svg.addEventListener('wheel', onWheel, { passive: false });

        return {
            setShape: function(shape, rangeLabel) {
                state.shape = shape === 'sector' ? 'sector' : 'circle';
                if (rangeLabel) {
                    state.rangeLabel = rangeLabel;
                    var rngEl = document.getElementById(prefix + 'Range');
                    if (rngEl) rngEl.setAttribute('data-label', rangeLabel);
                }
                updateVisual(state);
            },
            setValues: function(values) {
                if (!values) return;
                if (values.azimuth != null) state.azimuth = normalizeAzimuth(values.azimuth);
                if (values.angle != null) state.angle = snapAngle(values.angle);
                if (values.range != null) {
                    state.range = clamp(values.range, state.rangeMin, state.rangeMax);
                }
                if (values.shape) state.shape = values.shape === 'sector' ? 'sector' : 'circle';
                if (values.rangeLabel) state.rangeLabel = values.rangeLabel;
                updateVisual(state);
            },
            getValues: function() {
                return {
                    azimuth: state.azimuth,
                    angle: state.angle,
                    range: state.range,
                    shape: state.shape
                };
            }
        };
    }

    var activePanel = null;
    var PANEL_ID = 'coverageJoystickPanel';
    var BACKDROP_ID = 'coverageJoystickBackdrop';
    var PANEL_PREFIX = 'covJoyPanel';
    var MAP_BEHAVIORS = [
        'drag',
        'scrollZoom',
        'dblClickZoom',
        'multiTouch',
        'rightMouseButtonMagnifier',
        'leftMouseButtonMagnifier',
        'routeEditor',
        'ruler'
    ];
    var escHandler = null;
    var mapBehaviorsDisabled = false;
    /** Поведения, которые реально были включены до блокировки — только их возвращаем. */
    var savedEnabledBehaviors = null;

    function escapeHtmlText(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function lockMapForCoverageJoystick() {
        document.body.classList.add('coverage-joystick-map-locked');
        window._coverageJoystickMapLock = true;
        if (typeof myMap !== 'undefined' && myMap && myMap.behaviors && !mapBehaviorsDisabled) {
            savedEnabledBehaviors = [];
            MAP_BEHAVIORS.forEach(function(name) {
                try {
                    if (myMap.behaviors.isEnabled(name)) {
                        savedEnabledBehaviors.push(name);
                        myMap.behaviors.disable(name);
                    }
                } catch (e) {}
            });
            mapBehaviorsDisabled = true;
        }
    }

    function unlockMapForCoverageJoystick() {
        document.body.classList.remove('coverage-joystick-map-locked');
        window._coverageJoystickMapLock = false;
        if (mapBehaviorsDisabled && typeof myMap !== 'undefined' && myMap && myMap.behaviors) {
            var toRestore = savedEnabledBehaviors || [];
            toRestore.forEach(function(name) {
                // Линейку и редактор маршрутов никогда не включаем — в приложении они отключены.
                if (name === 'ruler' || name === 'routeEditor') return;
                try { myMap.behaviors.enable(name); } catch (e) {}
            });
            try { myMap.behaviors.disable('ruler'); } catch (e2) {}
            try { myMap.behaviors.disable('routeEditor'); } catch (e3) {}
            try { myMap.behaviors.disable('rightMouseButtonMagnifier'); } catch (e4) {}
            try { if (myMap.controls) myMap.controls.remove('rulerControl'); } catch (e5) {}
        }
        savedEnabledBehaviors = null;
        mapBehaviorsDisabled = false;
    }

    function hideObjectCardForJoystick() {
        var modal = document.getElementById('infoModal');
        if (modal && modal.style.display !== 'none') {
            modal.style.display = 'none';
            modal.setAttribute('data-coverage-joy-hidden', '1');
            return true;
        }
        return false;
    }

    function restoreObjectCardAfterJoystick() {
        var modal = document.getElementById('infoModal');
        if (modal && modal.getAttribute('data-coverage-joy-hidden') === '1') {
            modal.style.display = 'block';
            modal.removeAttribute('data-coverage-joy-hidden');
        }
    }

    function removeEscHandler() {
        if (escHandler) {
            document.removeEventListener('keydown', escHandler, true);
            escHandler = null;
        }
    }

    function closeCoverageJoystickPanel(opts) {
        opts = opts || {};
        var session = activePanel && activePanel.session;
        var onClose = activePanel && activePanel.opts && activePanel.opts.onClose;

        removeEscHandler();
        unlockMapForCoverageJoystick();

        var panel = document.getElementById(PANEL_ID);
        if (panel) {
            try { panel.remove(); } catch (e) {
                if (panel.parentNode) panel.parentNode.removeChild(panel);
            }
        }
        var backdrop = document.getElementById(BACKDROP_ID);
        if (backdrop) {
            try { backdrop.remove(); } catch (e2) {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
            }
        }

        activePanel = null;
        document.body.classList.remove('coverage-joystick-panel-open');

        if (!opts.skipRestore && session && session.restoreCard) {
            restoreObjectCardAfterJoystick();
        } else {
            var modal = document.getElementById('infoModal');
            if (modal) modal.removeAttribute('data-coverage-joy-hidden');
        }

        if (!opts.silent && typeof onClose === 'function') {
            try { onClose(); } catch (e3) {}
        }
    }

    function isCoverageJoystickPanelOpen() {
        return !!(activePanel && document.getElementById(PANEL_ID));
    }

    function isCoverageJoystickMapLocked() {
        return !!window._coverageJoystickMapLock;
    }

    /**
     * Отдельная плавающая панель с джойстиком (вне карточки объекта).
     * @param {object} opts
     * @param {boolean} [opts.hideCard=true] скрыть карточку объекта на время настройки
     * @param {boolean} [opts.lockMap=true] заблокировать карту и UI
     * @param {boolean} [opts.restoreCard=true] вернуть карточку при закрытии
     */
    function openCoverageJoystickPanel(opts) {
        closeCoverageJoystickPanel({ skipRestore: true, silent: true });
        opts = opts || {};
        var hideCard = opts.hideCard !== false;
        var lockMap = opts.lockMap !== false;
        var restoreCard = opts.restoreCard !== false;
        var title = opts.title || 'Настройка направления и охвата';
        var joyOpts = {
            idPrefix: PANEL_PREFIX,
            shape: opts.shape,
            azimuth: opts.azimuth,
            angle: opts.angle,
            range: opts.range,
            rangeMin: opts.rangeMin,
            rangeMax: opts.rangeMax,
            rangeStep: opts.rangeStep,
            rangeUnit: opts.rangeUnit,
            rangeLabel: opts.rangeLabel,
            accent: opts.accent
        };

        var cardWasHidden = false;
        if (hideCard) {
            cardWasHidden = hideObjectCardForJoystick();
        }

        var backdrop = document.createElement('div');
        backdrop.id = BACKDROP_ID;
        backdrop.className = 'coverage-joystick-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        document.body.appendChild(backdrop);

        var panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'coverage-joystick-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', title);
        panel.innerHTML =
            '<div class="coverage-joystick-panel__head">' +
                '<div class="coverage-joystick-panel__title">' + escapeHtmlText(title) + '</div>' +
                '<button type="button" class="coverage-joystick-panel__close" id="coverageJoystickPanelClose" title="Закрыть (Esc)" aria-label="Закрыть">×</button>' +
            '</div>' +
            '<div class="coverage-joystick-panel__body">' +
                buildCoverageJoystickHtml(joyOpts) +
            '</div>' +
            '<p class="coverage-joystick-panel__esc-hint">Esc или × — закрыть</p>';

        document.body.appendChild(panel);
        document.body.classList.add('coverage-joystick-panel-open');

        if (lockMap) {
            lockMapForCoverageJoystick();
        }

        var joyApi = setupCoverageJoystick({
            idPrefix: PANEL_PREFIX,
            getShape: opts.getShape,
            onChange: opts.onChange
        });

        function finish() {
            closeCoverageJoystickPanel();
        }

        var closeBtn = document.getElementById('coverageJoystickPanelClose');
        if (closeBtn) closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            finish();
        });

        // Клики по подложке не закрывают — только Esc / крестик
        backdrop.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
        backdrop.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
        backdrop.addEventListener('wheel', function(e) {
            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        escHandler = function(e) {
            if (e.key !== 'Escape' && e.keyCode !== 27) return;
            e.preventDefault();
            e.stopPropagation();
            finish();
        };
        document.addEventListener('keydown', escHandler, true);

        activePanel = {
            joyApi: joyApi,
            opts: opts,
            session: {
                restoreCard: restoreCard && cardWasHidden
            },
            setShape: function(shape, rangeLabel) {
                if (joyApi && joyApi.setShape) joyApi.setShape(shape, rangeLabel);
            },
            setValues: function(values) {
                if (joyApi && joyApi.setValues) joyApi.setValues(values);
            },
            close: finish
        };
        return activePanel;
    }

    function syncCoverageJoystickPanelShape(shape, rangeLabel) {
        if (activePanel && activePanel.setShape) {
            activePanel.setShape(shape, rangeLabel);
        }
    }

    global.buildCoverageJoystickHtml = buildCoverageJoystickHtml;
    global.setupCoverageJoystick = setupCoverageJoystick;
    global.openCoverageJoystickPanel = openCoverageJoystickPanel;
    global.closeCoverageJoystickPanel = closeCoverageJoystickPanel;
    global.isCoverageJoystickPanelOpen = isCoverageJoystickPanelOpen;
    global.isCoverageJoystickMapLocked = isCoverageJoystickMapLocked;
    global.syncCoverageJoystickPanelShape = syncCoverageJoystickPanelShape;
})(typeof window !== 'undefined' ? window : this);
