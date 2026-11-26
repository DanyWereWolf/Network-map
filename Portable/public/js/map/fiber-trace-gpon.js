/**
 * FiberTraceGpon — веер сплиттера: 1 жила → N выходов, у каждой ветки свой КОНЕЦ.
 * Работает и для GPON (ONU), и для обычных муфт/кроссов.
 * Не смешивается с продольной FiberBase-схемой (один путь).
 */
(function (global) {
    'use strict';

    var TIA = [
        '#0000FF', '#FF8C00', '#00FF00', '#8B4513',
        '#808080', '#FFFFFF', '#FF0000', '#000000',
        '#FFFF00', '#800080', '#FFC0CB', '#00CED1'
    ];

    function esc(s) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function svgEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function r1(n) { return Math.round(Number(n) * 10) / 10; }

    function getUid(obj) {
        if (typeof global.getObjectUniqueId === 'function') return global.getObjectUniqueId(obj);
        return obj && obj.properties ? obj.properties.get('uniqueId') : null;
    }

    function getTypeName(type) {
        if (typeof global.getObjectTypeName === 'function') return global.getObjectTypeName(type);
        return type || 'Объект';
    }

    function truncate(s, max) {
        s = String(s == null ? '' : s).trim();
        if (s.length <= max) return s;
        return s.slice(0, Math.max(1, max - 1)) + '…';
    }

    function fiberSafe(color) {
        if (!color) return '#3b82f6';
        var c = String(color).trim().toUpperCase();
        if (c === '#FFFFFF' || c === '#FFF' || c === 'WHITE') return '#e2e8f0';
        if (c === '#FFFF00' || c === '#FF0') return '#eab308';
        if (c === '#000000' || c === '#000') return '#1e293b';
        return color;
    }

    function colorForFiber(n) {
        n = Math.max(1, Number(n) || 1);
        return TIA[(n - 1) % 12];
    }

    function pickBestPath(paths) {
        if (global.FiberTrace && typeof FiberTrace.analyzePathStatus === 'function') {
            var best = null;
            var bestScore = -1;
            (paths || []).forEach(function (p) {
                var st = FiberTrace.analyzePathStatus(p);
                var score = (p && p.length) || 0;
                if (st.status === 'complete') score += 1000;
                if (score > bestScore) { bestScore = score; best = p; }
            });
            return best || (paths && paths[0]) || null;
        }
        return (paths && paths[0]) || null;
    }

    function endpointMeta(path) {
        if (global.FiberTrace && FiberTrace.getPathEndpointLabel) {
            var label = FiberTrace.getPathEndpointLabel(path) || '—';
        } else {
            label = '—';
        }
        for (var i = (path || []).length - 1; i >= 0; i--) {
            var it = path[i];
            if (!it) continue;
            if (it.type === 'object' && it.objectType === 'onu') {
                return { type: 'onu', name: it.objectName || 'ONU', object: it.object };
            }
            if (it.type === 'onuConnection' || it.type === 'splitterOutputToOnu') {
                return {
                    type: 'onu',
                    name: it.onuName || 'ONU',
                    object: it.onu || it.onuObj || null
                };
            }
            if (it.type === 'object' && it.objectType === 'mediaConverter') {
                return { type: 'mediaConverter', name: it.objectName || 'МК', object: it.object };
            }
            if (it.type === 'object' && it.objectType === 'node') {
                return { type: 'node', name: it.objectName || 'Узел', object: it.object };
            }
            if (it.type === 'object' || it.type === 'start') {
                return {
                    type: it.objectType || 'end',
                    name: it.objectName || getTypeName(it.objectType),
                    object: it.object || null
                };
            }
        }
        return { type: 'end', name: label, object: null };
    }

    function findFirstSplitter(path) {
        for (var i = 0; i < (path || []).length; i++) {
            var it = path[i];
            if (it && it.type === 'object' && it.objectType === 'splitter' && it.object) {
                return { index: i, object: it.object, name: it.objectName || 'Сплиттер' };
            }
        }
        return null;
    }

    function resolveOutIndex(path, hitIdx, splitterObj) {
        for (var j = hitIdx + 1; j < Math.min(path.length, hitIdx + 6); j++) {
            if (path[j] && path[j].outputIndex != null) return Number(path[j].outputIndex);
        }
        var outs = (splitterObj.properties && splitterObj.properties.get('outputConnections')) || [];
        for (var oi = 0; oi < outs.length; oi++) {
            var o = outs[oi];
            if (!o) continue;
            if (path.some(function (s) {
                if (!s) return false;
                if (s.type === 'object' && s.objectType === 'onu' && o.onuId &&
                    getUid(s.object) === o.onuId) return true;
                if ((s.type === 'onuConnection' || s.type === 'splitterOutputToOnu') && o.onuId) {
                    var oid = s.onuId || (s.onu && getUid(s.onu)) || (s.onuObj && getUid(s.onuObj));
                    return oid === o.onuId;
                }
                if (o.cableId && s.type === 'cable' && String(s.cableId) === String(o.cableId)) return true;
                if (o.hostId && s.type === 'object' && getUid(s.object) === o.hostId) return true;
                if (o.nodeId && s.type === 'object' && s.objectType === 'node' &&
                    getUid(s.object) === o.nodeId) return true;
                return false;
            })) return oi;
        }
        return null;
    }

    function feederFromPath(path) {
        for (var i = 0; i < (path || []).length; i++) {
            if (path[i] && path[i].type === 'cable' && path[i].fiberNumber != null) {
                var n = Number(path[i].fiberNumber);
                var col = colorForFiber(n);
                if (path[i].cable && typeof global.getFiberColors === 'function') {
                    try {
                        var colors = global.getFiberColors(path[i].cable) || [];
                        for (var c = 0; c < colors.length; c++) {
                            if (colors[c] && Number(colors[c].number) === n && colors[c].color) {
                                col = colors[c].color;
                                break;
                            }
                        }
                    } catch (e) {}
                }
                return { fiber: n, color: col };
            }
        }
        return { fiber: 1, color: colorForFiber(1) };
    }

    /**
     * Собираем GPON-модель: ствол до сплиттера + все выходы как отдельные КОНЕЦ.
     */
    function buildGponModel(paths) {
        var list = paths || [];
        if (list.length < 2) return null;
        var trunkSrc = pickBestPath(list);
        var spHit = findFirstSplitter(trunkSrc);
        if (!spHit) return null;

        var spId = getUid(spHit.object);
        var ratio = parseInt(spHit.object.properties.get('splitRatio'), 10) || 0;
        var outs = spHit.object.properties.get('outputConnections') || [];
        if (!ratio) ratio = Math.max(outs.length, 2);

        var byOut = {};
        var pathsThrough = 0;
        list.forEach(function (p) {
            var hit = findFirstSplitter(p);
            if (!hit || getUid(hit.object) !== spId) return;
            pathsThrough++;
            var oi = resolveOutIndex(p, hit.index, spHit.object);
            if (oi == null) return;
            var meta = endpointMeta(p);
            var score = (p.length || 0) + (meta.type === 'onu' ? 800 : 0);
            if (byOut[oi] && byOut[oi].score >= score) return;
            byOut[oi] = {
                outputIndex: oi,
                path: p,
                score: score,
                endpointType: meta.type,
                name: meta.name,
                object: meta.object
            };
        });

        var branches = Object.keys(byOut).map(function (k) { return byOut[k]; });
        branches.sort(function (a, b) {
            return Number(a.outputIndex) - Number(b.outputIndex);
        });

        /* Отдельный GPON-веер — только при ≥2 ONU; обычный сплиттер остаётся в FiberBase + доп. КОНЕЦ */
        var onuCount = branches.filter(function (b) { return b.endpointType === 'onu'; }).length;
        if (onuCount < 2) return null;
        if (branches.length < 2 || pathsThrough < 2) return null;

        var feeder = feederFromPath(trunkSrc);
        var trunkPath = trunkSrc.slice(0, spHit.index + 1);

        var trunkNodes = [];
        trunkPath.forEach(function (it) {
            if (!it) return;
            if (it.type === 'start' || it.type === 'object') {
                if (it.objectType === 'support' || it.objectType === 'attachment' ||
                    it.objectType === 'manhole') return;
                trunkNodes.push({
                    type: it.objectType,
                    name: it.objectName || getTypeName(it.objectType),
                    port: it.port != null ? it.port : null,
                    object: it.object || null
                });
            } else if (it.type === 'oltPortConnection' && it.olt) {
                trunkNodes.push({
                    type: 'olt',
                    name: it.oltName || 'OLT',
                    port: it.portNumber,
                    object: it.olt
                });
            }
        });
        /* Dedupe consecutive same uid */
        var deduped = [];
        trunkNodes.forEach(function (n) {
            var prev = deduped[deduped.length - 1];
            if (prev && getUid(prev.object) && getUid(n.object) &&
                getUid(prev.object) === getUid(n.object) && !n.port) return;
            deduped.push(n);
        });

        var hasOlt = deduped.some(function (n) {
            return n && (n.type === 'olt' || n.type === 'oltGpon');
        });
        var isGpon = onuCount >= 1 || hasOlt;

        return {
            feederFiber: feeder.fiber,
            feederColor: feeder.color,
            splitRatio: ratio,
            splitterName: spHit.name,
            splitterObj: spHit.object,
            trunkNodes: deduped,
            trunkPath: trunkPath,
            branches: branches,
            onuCount: onuCount,
            isGpon: isGpon
        };
    }

    function shouldUse(paths) {
        return !!buildGponModel(paths);
    }

    function pushPath(parts, d, stroke, traced) {
        var safe = fiberSafe(stroke);
        if (traced) {
            parts.push('<path d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="7" stroke-opacity="0.28" stroke-linecap="round" stroke-linejoin="round"/>');
            parts.push('<path d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="2.8" stroke-opacity="1" stroke-linecap="round" stroke-linejoin="round"/>');
            parts.push('<path class="trace-sch-signal" d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.95"/>');
        } else {
            parts.push('<path d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="1.4" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>');
        }
    }

    /* Плавный мост IN→OUT (как перемычка в FiberBase) */
    function bridgeCurve(x0, y0, x1, y1) {
        x0 = r1(x0); y0 = r1(y0); x1 = r1(x1); y1 = r1(y1);
        var mx = r1((x0 + x1) / 2);
        return 'M ' + x0 + ' ' + y0 + ' C ' + mx + ' ' + y0 + ', ' + mx + ' ' + y1 + ', ' + x1 + ' ' + y1;
    }

    /* Дуга к карточке КОНЕЦ */
    function fanCurve(x0, y0, x1, y1) {
        x0 = r1(x0); y0 = r1(y0); x1 = r1(x1); y1 = r1(y1);
        var dx = Math.abs(x1 - x0);
        var dir = x1 >= x0 ? 1 : -1;
        var c0 = Math.max(28, dx * 0.55);
        var c1 = Math.max(18, dx * 0.35);
        return 'M ' + x0 + ' ' + y0 +
            ' C ' + r1(x0 + dir * c0) + ' ' + y0 + ', ' +
            r1(x1 - dir * c1) + ' ' + y1 + ', ' +
            x1 + ' ' + y1;
    }

    function emitEndCard(parts, cx, cy, w, h, fiberN, name, typeLabel) {
        var x0 = r1(cx - w / 2);
        var y0 = r1(cy - h / 2);
        parts.push('<g class="trace-sch-endpoint trace-sch-endpoint--end trace-sch-endpoint--gpon-end">');
        parts.push('<rect class="trace-sch-ep-card" x="' + x0 + '" y="' + y0 +
            '" width="' + w + '" height="' + h + '" rx="10"/>');
        parts.push('<rect class="trace-sch-ep-badge" x="' + r1(x0 + 8) + '" y="' + r1(y0 + 8) +
            '" width="48" height="15" rx="7"/>');
        parts.push('<text class="trace-sch-ep-badge-txt" x="' + r1(x0 + 32) +
            '" y="' + r1(y0 + 19) + '" text-anchor="middle">КОНЕЦ</text>');
        parts.push('<text class="trace-sch-ep-fiber" x="' + r1(x0 + w - 10) + '" y="' +
            r1(y0 + 19) + '" text-anchor="end">ж' + (fiberN != null ? fiberN : '?') + '</text>');
        parts.push('<text class="trace-sch-ep-type" x="' + cx + '" y="' + r1(y0 + 40) +
            '" text-anchor="middle">' + svgEsc(truncate(typeLabel || 'ONU', 16)) + '</text>');
        parts.push('<text class="trace-sch-ep-name" x="' + cx + '" y="' + r1(y0 + 56) +
            '" text-anchor="middle"><title>' + svgEsc(name || '') + '</title>' +
            svgEsc(truncate(name || 'ONU', 18)) + '</text>');
        parts.push('<circle class="trace-sch-ep-join trace-sch-ep-join--end" cx="' +
            x0 + '" cy="' + cy + '" r="5"/>');
        parts.push('</g>');
        return x0;
    }

    function renderGponSvg(model) {
        if (!model) return '';
        var stroke = fiberSafe(model.feederColor);
        var fiberN = model.feederFiber;
        var branches = model.branches || [];
        var ratio = Math.max(model.splitRatio || 2, branches.length, 2);

        var padX = 40;
        var cardW = 140;
        var cardH = 72;
        var cardGap = 18;
        var nodeGap = 150;
        var fanX = 0;

        var trunkNodes = model.trunkNodes || [];
        var parts = [];

        /* Геометрия ствола по X */
        var nodeXs = [];
        var x = padX + 70;
        trunkNodes.forEach(function (n, i) {
            if (i === 0) {
                nodeXs.push(x);
                x += 110;
            } else if (n.type === 'splitter') {
                fanX = x + 36;
                nodeXs.push(fanX);
            } else {
                nodeXs.push(x);
                x += nodeGap;
            }
        });
        if (!fanX) {
            fanX = x + 40;
            if (!trunkNodes.length || trunkNodes[trunkNodes.length - 1].type !== 'splitter') {
                trunkNodes = trunkNodes.concat([{
                    type: 'splitter',
                    name: model.splitterName || 'Сплиттер',
                    object: model.splitterObj
                }]);
                nodeXs.push(fanX);
            }
        }

        var spInX = r1(fanX - 28);
        var spOutX = r1(fanX + 58);
        var endColX = r1(spOutX + 178);
        var slotH = cardH + cardGap;
        var fanCount = Math.max(ratio, branches.length, 1);

        /* Слоты OUT 0..N-1 по индексу выхода, симметрично вокруг ствола */
        var outSlotY = {};
        for (var oi0 = 0; oi0 < fanCount; oi0++) {
            outSlotY[oi0] = (oi0 - (fanCount - 1) / 2) * slotH;
        }
        var yRelMin = outSlotY[0];
        var yRelMax = outSlotY[fanCount - 1];
        var topLabelH = 52;
        var trunkY = r1(topLabelH + cardH / 2 + 12 - yRelMin);
        var height = r1(trunkY + yRelMax + cardH / 2 + 40);
        var width = r1(endColX + cardW / 2 + padX);

        function outY(oi) {
            return r1(trunkY + outSlotY[oi]);
        }

        parts.push('<svg class="trace-schematic-svg trace-schematic-svg--fiberbase trace-schematic-svg--gpon" viewBox="0 0 ' +
            width + ' ' + height + '" width="' + width + '" height="' + height +
            '" data-base-w="' + width + '" data-base-h="' + height +
            '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Схема GPON">');

        /* СТАРТ */
        if (trunkNodes[0]) {
            var sx = nodeXs[0];
            parts.push('<g class="trace-sch-endpoint trace-sch-endpoint--start">');
            parts.push('<rect class="trace-sch-ep-card" x="' + r1(sx - 66) + '" y="' + r1(trunkY - 36) +
                '" width="132" height="72" rx="10"/>');
            parts.push('<rect class="trace-sch-ep-badge" x="' + r1(sx - 58) + '" y="' + r1(trunkY - 28) +
                '" width="48" height="15" rx="7"/>');
            parts.push('<text class="trace-sch-ep-badge-txt" x="' + r1(sx - 34) + '" y="' + r1(trunkY - 17) +
                '" text-anchor="middle">СТАРТ</text>');
            parts.push('<text class="trace-sch-ep-fiber" x="' + r1(sx + 56) + '" y="' + r1(trunkY - 17) +
                '" text-anchor="end">ж' + fiberN + '</text>');
            parts.push('<text class="trace-sch-ep-type" x="' + sx + '" y="' + r1(trunkY + 4) +
                '" text-anchor="middle">' + svgEsc(truncate(getTypeName(trunkNodes[0].type), 16)) + '</text>');
            parts.push('<text class="trace-sch-ep-name" x="' + sx + '" y="' + r1(trunkY + 20) +
                '" text-anchor="middle">' + svgEsc(truncate(trunkNodes[0].name, 18)) + '</text>');
            parts.push('</g>');
        }

        /* Промежуточные узлы + ствол */
        for (var i = 0; i < trunkNodes.length; i++) {
            var n = trunkNodes[i];
            var nx = nodeXs[i];
            if (i > 0) {
                var prevX = nodeXs[i - 1];
                var fromX = (i === 1) ? r1(prevX + 66) : r1(prevX + 28);
                if (trunkNodes[i - 1].type === 'splitter') fromX = r1(prevX);
                pushPath(parts, 'M ' + fromX + ' ' + trunkY + ' L ' +
                    r1(nx - (n.type === 'splitter' ? 40 : 28)) + ' ' + trunkY, stroke, true);
            }
            if (n.type === 'splitter') continue;
            if (i === 0) continue;
            parts.push('<rect class="trace-sch-col-bg" x="' + r1(nx - 28) + '" y="' + r1(trunkY - 28) +
                '" width="56" height="56" rx="8"/>');
            parts.push('<text class="trace-sch-node-title" x="' + nx + '" y="' + r1(trunkY - 48) +
                '" text-anchor="middle">' + svgEsc(truncate('[' + getTypeName(n.type) + ']', 20)) + '</text>');
            parts.push('<text class="trace-sch-node-title" x="' + nx + '" y="' + r1(trunkY - 34) +
                '" text-anchor="middle">' + svgEsc(truncate(n.name, 18)) + '</text>');
            if (n.port != null) {
                parts.push('<text class="trace-sch-node-port" x="' + nx + '" y="' + r1(trunkY + 40) +
                    '" text-anchor="middle">порт ' + n.port + '</text>');
            }
            parts.push('<circle cx="' + nx + '" cy="' + trunkY + '" r="4.5" fill="' + stroke +
                '" stroke="#0f172a" stroke-width="1"/>');
        }

        /* Заголовок сплиттера */
        parts.push('<text class="trace-sch-node-title" x="' + r1((spInX + spOutX) / 2) + '" y="' +
            r1(Math.min(trunkY + yRelMin, trunkY) - cardH / 2 - 28) +
            '" text-anchor="middle">' + svgEsc(truncate('[Сплиттер] ' + model.splitterName, 28)) + '</text>');
        parts.push('<text class="trace-sch-node-port" x="' + r1((spInX + spOutX) / 2) + '" y="' +
            r1(Math.min(trunkY + yRelMin, trunkY) - cardH / 2 - 14) +
            '" text-anchor="middle">1:' + ratio + '</text>');

        /* IN */
        parts.push('<rect class="trace-sch-col-bg" x="' + r1(spInX - 12) + '" y="' + r1(trunkY - 14) +
            '" width="24" height="28" rx="5"/>');
        parts.push('<text class="trace-sch-col-cap" x="' + spInX + '" y="' + r1(trunkY - 20) +
            '" text-anchor="middle">IN</text>');
        parts.push('<circle cx="' + spInX + '" cy="' + trunkY + '" r="5" fill="' + stroke +
            '" stroke="#0f172a" stroke-width="1"/>');

        /* Ствол → IN */
        var lastNonSp = null;
        for (var li = trunkNodes.length - 1; li >= 0; li--) {
            if (trunkNodes[li].type !== 'splitter') { lastNonSp = li; break; }
        }
        if (lastNonSp != null) {
            pushPath(parts,
                'M ' + r1(nodeXs[lastNonSp] + (lastNonSp === 0 ? 66 : 28)) + ' ' + trunkY +
                ' L ' + spInX + ' ' + trunkY, stroke, true);
        }

        /* Колонка OUT — мягкий фон по высоте веера */
        var outBgTop = r1(trunkY + yRelMin - 14);
        var outBgH = r1((yRelMax - yRelMin) + 28);
        parts.push('<rect class="trace-sch-col-bg" x="' + r1(spOutX - 12) + '" y="' + outBgTop +
            '" width="24" height="' + outBgH + '" rx="8"/>');
        parts.push('<text class="trace-sch-col-cap" x="' + spOutX + '" y="' + r1(outBgTop - 6) +
            '" text-anchor="middle">OUT</text>');

        /* Занятые выходы: плавная дуга IN→OUT + дуга к своему КОНЕЦ */
        var usedOut = {};
        branches.forEach(function (br) {
            var oi = Number(br.outputIndex);
            if (oi !== oi || oi < 0) oi = 0;
            if (oi >= fanCount) oi = fanCount - 1;
            usedOut[oi] = true;
            var oy = outY(oi);

            pushPath(parts, bridgeCurve(spInX, trunkY, spOutX, oy), stroke, true);

            parts.push('<circle cx="' + spOutX + '" cy="' + oy + '" r="4.5" fill="' + stroke +
                '" stroke="#0f172a" stroke-width="1"/>');
            parts.push('<text class="trace-sch-fiber-num trace-sch-fiber-num--traced" x="' +
                r1(spOutX - 10) + '" y="' + r1(oy + 3) + '" text-anchor="end">' +
                (oi + 1) + '</text>');

            var joinX = emitEndCard(
                parts, endColX, oy, cardW, cardH, fiberN, br.name,
                br.endpointType === 'onu' ? 'ONU' : getTypeName(br.endpointType)
            );
            pushPath(parts, fanCurve(spOutX, oy, joinX, oy), stroke, true);
        });

        /* Свободные выходы — точки без толстой жилы */
        for (var oi = 0; oi < ratio; oi++) {
            if (usedOut[oi]) continue;
            var fy = outY(oi);
            parts.push('<circle cx="' + spOutX + '" cy="' + fy + '" r="3.5" fill="#fff" stroke="#94a3b8" stroke-width="1"/>');
            parts.push('<text class="trace-sch-fiber-num" x="' + r1(spOutX - 10) + '" y="' + r1(fy + 3) +
                '" text-anchor="end">' + (oi + 1) + '</text>');
        }

        parts.push('</svg>');
        return parts.join('');
    }

    function buildSchematicHtml(paths) {
        var model = buildGponModel(paths);
        if (!model) return '';

        var isGpon = !!model.isGpon;
        var branchN = (model.branches && model.branches.length) || 0;
        var mode = isGpon ? 'gpon' : 'splitter-fan';
        var title = isGpon ? 'Трассировка GPON' : 'Разветвление сплиттера';
        var endBadge = isGpon ? 'GPON' : 'Сплиттер';
        var endStrong = isGpon
            ? (model.onuCount + ' ONU · 1:' + model.splitRatio)
            : (branchN + ' конца · 1:' + model.splitRatio);
        var hint = isGpon
            ? ('GPON: у каждого выхода свой КОНЕЦ. Все ветки — та же жила ж' +
                String(model.feederFiber) + '. Ctrl+колёсико — масштаб.')
            : ('Сплиттер делит одну жилу на несколько: у каждой ветки свой КОНЕЦ. Жила ж' +
                String(model.feederFiber) + '. Ctrl+колёсико — масштаб.');

        var html = '<div class="trace-schematic trace-schematic--studio trace-schematic--fiberbase trace-schematic--gpon" data-trace-mode="' + mode + '">';
        html += '<div class="trace-schematic-head"><div class="trace-schematic-title-row">';
        html += '<div class="trace-schematic-title">' + esc(title) + '</div></div>';
        html += '<div class="trace-schematic-tools"><div class="trace-sch-zoom-controls">';
        html += '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="out" title="Уменьшить">−</button>';
        html += '<input type="range" class="trace-sch-zoom-slider" min="25" max="250" value="100" step="5" aria-label="Масштаб">';
        html += '<span class="trace-sch-zoom-label">100%</span>';
        html += '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="in" title="Увеличить">+</button>';
        html += '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="fit" title="Вписать">⊡</button>';
        html += '</div>';
        html += '<button type="button" class="trace-sch-zoom-btn trace-sch-pdf-btn" data-trace-sch-pdf="1" title="Экспорт PDF">⎙</button>';
        html += '</div></div>';

        html += '<div class="trace-sch-export-root"><div class="trace-sch-meta-row">';
        html += '<div class="trace-sch-meta-main"><div class="trace-endpoint-summary">';
        html += '<div class="trace-endpoint-summary__side trace-endpoint-summary__side--start">';
        html += '<span class="trace-endpoint-summary__badge">Старт</span>';
        var startN = model.trunkNodes[0];
        html += '<strong>' + esc(startN ? startN.name : 'Старт') + '</strong>';
        html += '<span class="trace-endpoint-summary__muted">' +
            esc(startN ? getTypeName(startN.type) : '') +
            (model.feederFiber != null ? ' · ж' + model.feederFiber : '') + '</span></div>';
        html += '<span class="trace-endpoint-summary__arrow" aria-hidden="true">→</span>';
        html += '<div class="trace-endpoint-summary__side trace-endpoint-summary__side--end">';
        html += '<span class="trace-endpoint-summary__badge">' + esc(endBadge) + '</span>';
        html += '<strong>' + esc(endStrong) + '</strong>';
        html += '<span class="trace-endpoint-summary__muted">одна жила → все выходы</span></div>';
        html += '</div></div></div>';

        html += '<div class="trace-schematic-scroll"><div class="trace-sch-zoom-inner">';
        html += renderGponSvg(model);
        html += '</div></div></div>';
        html += '<p class="trace-schematic-hint">' + esc(hint) + '</p>';
        html += '</div>';
        return html;
    }

    global.FiberTraceGpon = {
        shouldUse: shouldUse,
        buildGponModel: buildGponModel,
        buildSchematicHtml: buildSchematicHtml,
        renderGponSvg: renderGponSvg
    };
})(typeof window !== 'undefined' ? window : this);
