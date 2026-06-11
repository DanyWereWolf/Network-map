/**
 * Сплиттеры внутри схемы муфты/кросса (не на карте).
 */
(function (global) {
    'use strict';

    var HOST_TYPES = ['sleeve', 'cross'];
    var DEFAULT_RATIO = 8;
    var DEFAULT_W = 120;
    var HEADER_ACTIONS_W = 58;
    var DEFAULT_H = 52;
    var BOUNDS_PAD = 12;
    var HEADER_H = 24;
    var FOOTER_PAD = 10;
    var PORT_GAP = 14;

    function computeSplitterLayout(ratio) {
        ratio = parseInt(ratio, 10) || DEFAULT_RATIO;
        var portR = ratio > 16 ? 3 : (ratio > 8 ? 3.5 : 4.5);
        var portAreaH = Math.max(36, Math.max(ratio, 2) * PORT_GAP);
        if (ratio > 12) portAreaH = Math.max(portAreaH, ratio * 11);
        var h = HEADER_H + portAreaH + FOOTER_PAD;
        return { HEADER_H: HEADER_H, portAreaH: portAreaH, h: h, portR: portR, FOOTER_PAD: FOOTER_PAD };
    }

    function outputPortLocalY(pi, ratio, layout) {
        var portTop = layout.HEADER_H + 8;
        var portBottom = layout.h - layout.FOOTER_PAD;
        if (ratio <= 1) return (portTop + portBottom) / 2;
        return portTop + (pi / (ratio - 1)) * (portBottom - portTop);
    }

    function inputPortLocalY(layout) {
        var portTop = layout.HEADER_H + 8;
        var portBottom = layout.h - layout.FOOTER_PAD;
        return (portTop + portBottom) / 2;
    }

    function isSchemeMirrored(rec) {
        if (!rec) return false;
        return !!rec.schemeMirrored;
    }

    function computeSchemeSplitterBox(ratio) {
        ratio = parseInt(ratio, 10) || DEFAULT_RATIO;
        var layout = computeSplitterLayout(ratio);
        return {
            w: DEFAULT_W,
            h: layout.h,
            HEADER_H: layout.HEADER_H,
            FOOTER_PAD: layout.FOOTER_PAD,
            portR: layout.portR
        };
    }

    function schemeSplitterPortPos(cx, cy, box, kind, outputIndex, ratio, mirrored) {
        var inY = cy - box.h / 2 + inputPortLocalY(box);
        var outY = cy - box.h / 2 + outputPortLocalY(outputIndex || 0, ratio, box);
        if (!mirrored) {
            if (kind === 'input') return { x: cx - box.w / 2 - 8, y: inY };
            return { x: cx + box.w / 2 + 8, y: outY };
        }
        if (kind === 'input') return { x: cx + box.w / 2 + 8, y: inY };
        return { x: cx - box.w / 2 - 8, y: outY };
    }

    function fiberSchemeExitX(pos, badgeW) {
        return pos.isLeft ? pos.x + badgeW / 2 : pos.x - badgeW / 2;
    }

    function buildSplitterFiberPath(fiberPos, portX, portY, pathOpts) {
        if (!fiberPos || !pathOpts || !pathOpts.buildConnectionPath) return '';
        var badgeW = pathOpts.badgeW || 22;
        var nodeR = pathOpts.nodeR || 4;
        return pathOpts.buildConnectionPath(
            fiberSchemeExitX(fiberPos, badgeW), fiberPos.y,
            portX, portY,
            nodeR + 2,
            { sameSide: false, isLeft: fiberPos.isLeft, svgWidth: pathOpts.svgWidth || 800 }
        );
    }

    function buildSplitterConnectionPath(x1, y1, x2, y2, fiberIsLeft, pathOpts) {
        if (!pathOpts || !pathOpts.buildConnectionPath) return '';
        var nodeR = pathOpts.nodeR || 4;
        return pathOpts.buildConnectionPath(
            x1, y1, x2, y2, nodeR + 2,
            { sameSide: false, isLeft: fiberIsLeft, svgWidth: pathOpts.svgWidth || 800 }
        );
    }

    function getSchemeSplitterObstacles(hostObj, svgWidth, svgHeight) {
        if (!isHost(hostObj)) return [];
        var list = getList(hostObj);
        var obstacles = [];
        list.forEach(function (rec, idx) {
            var def = defaultPosition(svgWidth, svgHeight, idx, list.length);
            var rawX = rec.schemeX != null ? rec.schemeX : def.x;
            var rawY = rec.schemeY != null ? rec.schemeY : def.y;
            var clamped = clampPosition(rawX, rawY, svgWidth, svgHeight, rec.splitRatio);
            var box = computeSchemeSplitterBox(rec.splitRatio);
            var pad = 14;
            obstacles.push({
                x: clamped.x - box.w / 2 - pad,
                y: clamped.y - box.h / 2 - pad,
                w: box.w + pad * 2,
                h: box.h + pad * 2,
                cx: clamped.x,
                cy: clamped.y
            });
        });
        return obstacles;
    }

    function appendSplitterLinkHtml(buf, pathD, rec, linkKind, attrs, color, shadow, renderOpts) {
        if (!pathD) return buf;
        var esc = typeof global.escapeHtml === 'function' ? global.escapeHtml : function (s) { return String(s); };
        var linkKey = linkKind === 'input' ? ('in:' + rec.id) : ('out:' + rec.id + ':' + attrs.outputIndex);
        var label = attrs.label ? String(attrs.label).trim() : '';
        buf += '<path class="fiber-scheme-splitter-link-shadow" d="' + pathD + '" stroke="' + shadow + '" stroke-width="6" stroke-linecap="round" opacity="0.35" pointer-events="none"/>';
        buf += '<path class="fiber-scheme-splitter-link" d="' + pathD + '" data-link-key="' + linkKey + '" data-splitter-id="' + attrs.id + '" data-link-kind="' + linkKind + '"' + attrs.extra + ' data-conn-label="' + esc(label) + '" stroke="' + color + '" stroke-width="4.5" stroke-linecap="round" pointer-events="none">';
        if (label) buf += '<title>' + esc(label) + '</title>';
        buf += '</path>';
        buf += '<path class="fiber-scheme-splitter-link-hit" d="' + pathD + '" stroke="transparent" stroke-width="14" data-link-key="' + linkKey + '" data-splitter-id="' + attrs.id + '" data-link-kind="' + linkKind + '"' + attrs.extra + ' style="cursor:' + (renderOpts.isEditMode ? 'pointer' : 'default') + '">';
        if (label) buf += '<title>' + esc(label) + '</title>';
        buf += '</path>';
        if (label && renderOpts.pathMidpoint) {
            var mid = renderOpts.pathMidpoint(pathD);
            renderOpts._linkLabels = renderOpts._linkLabels || [];
            renderOpts._linkLabels.push({ linkKey: linkKey, pathD: pathD, label: label, mid: mid });
        }
        return buf;
    }

    function getSplitterPortPos(hostObj, splitterId, portKind, outputIndex, svgW, svgH) {
        if (!hostObj || !splitterId) return null;
        var list = getList(hostObj);
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return null;
        var idx = list.indexOf(rec);
        var def = defaultPosition(svgW, svgH, idx >= 0 ? idx : 0, list.length);
        var x = rec.schemeX != null ? rec.schemeX : def.x;
        var y = rec.schemeY != null ? rec.schemeY : def.y;
        var ratio = parseInt(rec.splitRatio, 10) || DEFAULT_RATIO;
        var box = computeSchemeSplitterBox(ratio);
        return schemeSplitterPortPos(x, y, box, portKind, outputIndex, ratio, isSchemeMirrored(rec));
    }

    function updateSplitterLinkPaths(svg, splitterId, cx, cy, splitRatio, pathOpts) {
        if (!svg || !pathOpts || !pathOpts.buildConnectionPath) return;
        var ratio = parseInt(splitRatio, 10) || DEFAULT_RATIO;
        var mirrored = false;
        if (pathOpts.hostObj) {
            var recLink = findInHost(pathOpts.hostObj, splitterId);
            if (recLink) mirrored = isSchemeMirrored(recLink);
        }
        var box = computeSchemeSplitterBox(ratio);
        var inPort = schemeSplitterPortPos(cx, cy, box, 'input', 0, ratio, mirrored);
        var inPortX = inPort.x;
        var inPortY = inPort.y;
        svg.querySelectorAll('.fiber-scheme-splitter-link[data-splitter-id="' + splitterId + '"]').forEach(function (pathEl) {
            if (pathEl.getAttribute('data-target-splitter-id')) return;
            var kind = pathEl.getAttribute('data-link-kind');
            var fx = parseFloat(pathEl.getAttribute('data-fiber-exit-x'));
            var fy = parseFloat(pathEl.getAttribute('data-fiber-exit-y'));
            var isLeft = pathEl.getAttribute('data-fiber-is-left') === '1';
            if (isNaN(fx) || isNaN(fy)) return;
            var portX;
            var portY;
            var d;
            if (kind === 'input') {
                portX = inPortX;
                portY = inPortY;
                d = buildSplitterConnectionPath(fx, fy, portX, portY, isLeft, pathOpts);
            } else if (kind === 'output') {
                var oi = parseInt(pathEl.getAttribute('data-output-index'), 10);
                if (isNaN(oi)) return;
                var outPort = schemeSplitterPortPos(cx, cy, box, 'output', oi, ratio, mirrored);
                portX = outPort.x;
                portY = outPort.y;
                d = buildSplitterConnectionPath(portX, portY, fx, fy, isLeft, pathOpts);
            } else return;
            pathEl.setAttribute('d', d);
            var prev = pathEl.previousElementSibling;
            if (prev && prev.classList && prev.classList.contains('fiber-scheme-splitter-link-shadow')) {
                prev.setAttribute('d', d);
            }
        });
        var hostObj = pathOpts.hostObj;
        var svgW = pathOpts.svgWidth || 800;
        var svgH = pathOpts.svgHeight || 400;
        if (!hostObj) return;
        svg.querySelectorAll('.fiber-scheme-splitter-link[data-target-splitter-id]').forEach(function (pathEl) {
            var srcId = pathEl.getAttribute('data-splitter-id');
            var tgtId = pathEl.getAttribute('data-target-splitter-id');
            if (srcId !== splitterId && tgtId !== splitterId) return;
            var oi = parseInt(pathEl.getAttribute('data-output-index'), 10);
            if (isNaN(oi)) return;
            var srcPort = getSplitterPortPos(hostObj, srcId, 'output', oi, svgW, svgH);
            var tgtPort = getSplitterPortPos(hostObj, tgtId, 'input', 0, svgW, svgH);
            if (srcId === splitterId && cx != null && cy != null) {
                srcPort = schemeSplitterPortPos(cx, cy, box, 'output', oi, ratio, mirrored);
            }
            if (tgtId === splitterId && cx != null && cy != null) {
                var tgtRec = findInHost(hostObj, tgtId);
                var tgtRatio = tgtRec ? parseInt(tgtRec.splitRatio, 10) || DEFAULT_RATIO : ratio;
                var tgtBox = computeSchemeSplitterBox(tgtRatio);
                var tgtMirrored = tgtRec ? isSchemeMirrored(tgtRec) : false;
                tgtPort = schemeSplitterPortPos(cx, cy, tgtBox, 'input', 0, tgtRatio, tgtMirrored);
            }
            if (!srcPort || !tgtPort) return;
            var isLeft = tgtPort.x < srcPort.x;
            var d = buildSplitterConnectionPath(srcPort.x, srcPort.y, tgtPort.x, tgtPort.y, isLeft, pathOpts);
            pathEl.setAttribute('d', d);
            var prev = pathEl.previousElementSibling;
            if (prev && prev.classList && prev.classList.contains('fiber-scheme-splitter-link-shadow')) {
                prev.setAttribute('d', d);
            }
            var hit = pathEl.nextElementSibling;
            if (hit && hit.classList && hit.classList.contains('fiber-scheme-splitter-link-hit')) {
                hit.setAttribute('d', d);
            }
        });
    }

    function splitterHeight(splitRatio) {
        return computeSchemeSplitterBox(splitRatio).h;
    }

    function getBounds(svgWidth, svgHeight, splitRatio) {
        var box = computeSchemeSplitterBox(splitRatio);
        var halfW = box.w / 2;
        var halfH = box.h / 2;
        return {
            minX: halfW + BOUNDS_PAD,
            maxX: Math.max(halfW + BOUNDS_PAD, (svgWidth || 800) - halfW - BOUNDS_PAD),
            minY: halfH + BOUNDS_PAD,
            maxY: Math.max(halfH + BOUNDS_PAD, (svgHeight || 400) - halfH - BOUNDS_PAD)
        };
    }

    function clampPosition(x, y, svgWidth, svgHeight, splitRatio) {
        var b = getBounds(svgWidth, svgHeight, splitRatio);
        return {
            x: Math.max(b.minX, Math.min(b.maxX, x)),
            y: Math.max(b.minY, Math.min(b.maxY, y))
        };
    }

    function getCenterZone(svgWidth, svgHeight) {
        return {
            x: (svgWidth || 800) * 0.2,
            y: BOUNDS_PAD + 6,
            w: (svgWidth || 800) * 0.6,
            h: Math.max(100, (svgHeight || 400) - BOUNDS_PAD * 2 - 12)
        };
    }

    function ensureAllInBounds(hostObj, svgWidth, svgHeight) {
        if (!isHost(hostObj)) return false;
        var list = getList(hostObj);
        var changed = false;
        list.forEach(function (rec) {
            if (rec.schemeX == null || rec.schemeY == null) return;
            var c = clampPosition(rec.schemeX, rec.schemeY, svgWidth, svgHeight, rec.splitRatio);
            if (c.x !== rec.schemeX || c.y !== rec.schemeY) {
                rec.schemeX = c.x;
                rec.schemeY = c.y;
                changed = true;
            }
        });
        if (changed && typeof global.saveData === 'function') global.saveData();
        return changed;
    }

    function resetAllPositions(hostObj, svgWidth, svgHeight) {
        if (!isHost(hostObj)) return;
        var list = getList(hostObj);
        var zone = getCenterZone(svgWidth, svgHeight);
        list.forEach(function (rec, idx) {
            var cols = Math.ceil(Math.sqrt(list.length));
            var row = Math.floor(idx / cols);
            var col = idx % cols;
            var rows = Math.ceil(list.length / cols);
            var gapX = 100;
            var gapY = 68;
            var cx = zone.x + zone.w / 2;
            var cy = zone.y + zone.h / 2;
            var rawX = cx + (col - (cols - 1) / 2) * gapX;
            var rawY = cy + (row - (rows - 1) / 2) * gapY;
            var c = clampPosition(rawX, rawY, svgWidth, svgHeight, rec.splitRatio);
            rec.schemeX = c.x;
            rec.schemeY = c.y;
        });
        if (typeof global.saveData === 'function') global.saveData();
    }

    function toggleSchemeMirrored(hostObj, splitterId, svgWidth, svgHeight) {
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        rec.schemeMirrored = !isSchemeMirrored(rec);
        if (rec.schemeX != null && rec.schemeY != null) {
            var c = clampPosition(rec.schemeX, rec.schemeY, svgWidth || 800, svgHeight || 400, rec.splitRatio);
            rec.schemeX = c.x;
            rec.schemeY = c.y;
        }
        hostObj.properties.set('embeddedSplitters', getList(hostObj));
        if (typeof global.saveData === 'function') global.saveData();
        return true;
    }

    function isHost(obj) {
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        return HOST_TYPES.indexOf(t) !== -1;
    }

    function genId() {
        return 'esp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    function parseConnKey(key) {
        if (typeof global.parseFiberConnectionKey === 'function') return global.parseFiberConnectionKey(key);
        var parts = String(key).split('-');
        if (parts.length < 2) return null;
        var fiberNumber = parseInt(parts.pop(), 10);
        return { cableId: parts.join('-'), fiberNumber: fiberNumber };
    }

    function fiberKey(cableId, fiberNumber) {
        if (typeof global.fiberConnKey === 'function') return global.fiberConnKey(cableId, fiberNumber);
        return cableId + '-' + fiberNumber;
    }

    function getList(hostObj) {
        if (!isHost(hostObj)) return [];
        var list = hostObj.properties.get('embeddedSplitters');
        if (!Array.isArray(list)) {
            list = [];
            hostObj.properties.set('embeddedSplitters', list);
        }
        return list;
    }

    function findInHost(hostObj, splitterId) {
        if (!hostObj || !splitterId) return null;
        var list = getList(hostObj);
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === splitterId) return list[i];
        }
        return null;
    }

    function findRecord(splitterId) {
        if (!splitterId || !global.objects) return null;
        for (var i = 0; i < global.objects.length; i++) {
            var o = global.objects[i];
            if (!isHost(o)) continue;
            var rec = findInHost(o, splitterId);
            if (rec) return { host: o, record: rec };
        }
        return null;
    }

    function findMapSplitter(splitterId) {
        if (!splitterId || !global.objects) return null;
        return global.objects.find(function (o) {
            return o.properties && o.properties.get('type') === 'splitter' &&
                (o.properties.get('uniqueId') === splitterId ||
                    (typeof global.getObjectUniqueId === 'function' && global.getObjectUniqueId(o) === splitterId));
        }) || null;
    }

    function normalizeRecord(rec, index) {
        rec.splitRatio = parseInt(rec.splitRatio, 10) || DEFAULT_RATIO;
        if (!rec.name) rec.name = 'Сплиттер ' + (index + 1);
        if (!rec.outputConnections) rec.outputConnections = [];
        while (rec.outputConnections.length < rec.splitRatio) rec.outputConnections.push(null);
        if (rec.outputConnections.length > rec.splitRatio) rec.outputConnections = rec.outputConnections.slice(0, rec.splitRatio);
        if (rec.inputFiber && rec.inputFiber.cableId) {
            rec.inputCableId = rec.inputFiber.cableId;
            rec.inputFiberNumber = rec.inputFiber.fiberNumber;
        }
        if (rec.schemeMirrored == null) rec.schemeMirrored = false;
        if (rec.schemeVertical != null) delete rec.schemeVertical;
        if (rec.schemeHorizontal != null) delete rec.schemeHorizontal;
        return rec;
    }

    function syncInputFromParentSplitter(hostObj, rec) {
        if (!hostObj || !rec) return false;
        var list = getList(hostObj);
        for (var i = 0; i < list.length; i++) {
            var parent = list[i];
            if (!parent || parent.id === rec.id) continue;
            var outs = parent.outputConnections || [];
            for (var oi = 0; oi < outs.length; oi++) {
                if (!outs[oi] || outs[oi].splitterId !== rec.id) continue;
                var root = parent.inputFiber;
                if (!root && parent.inputCableId && parent.inputFiberNumber != null) {
                    root = { cableId: parent.inputCableId, fiberNumber: parent.inputFiberNumber };
                }
                if (root && root.cableId && root.fiberNumber != null) {
                    rec.inputCableId = root.cableId;
                    rec.inputFiberNumber = root.fiberNumber;
                    rec.inputFiber = { cableId: root.cableId, fiberNumber: root.fiberNumber };
                } else {
                    rec.inputCableId = null;
                    rec.inputFiberNumber = null;
                    rec.inputFiber = null;
                }
                return true;
            }
        }
        return false;
    }

    function syncInputFromConnections(hostObj, rec) {
        if (!hostObj || !rec) return;
        var sc = hostObj.properties.get('splitterConnections') || {};
        var found = null;
        Object.keys(sc).forEach(function (key) {
            if (sc[key] && sc[key].splitterId === rec.id) found = key;
        });
        if (found && typeof global.parseFiberConnectionKey === 'function') {
            var p = global.parseFiberConnectionKey(found);
            if (p) {
                rec.inputCableId = p.cableId;
                rec.inputFiberNumber = p.fiberNumber;
                rec.inputFiber = { cableId: p.cableId, fiberNumber: p.fiberNumber };
                return;
            }
        }
        if (found) {
            var parsed = parseConnKey(found);
            if (parsed) {
                rec.inputCableId = parsed.cableId;
                rec.inputFiberNumber = parsed.fiberNumber;
                rec.inputFiber = { cableId: parsed.cableId, fiberNumber: parsed.fiberNumber };
                return;
            }
        }
        if (syncInputFromParentSplitter(hostObj, rec)) return;
        rec.inputCableId = null;
        rec.inputFiberNumber = null;
        rec.inputFiber = null;
    }

    function syncAllInputs(hostObj) {
        getList(hostObj).forEach(function (rec, idx) {
            normalizeRecord(rec, idx);
            syncInputFromConnections(hostObj, rec);
        });
    }

    function createFacade(hostObj, rec) {
        return {
            _embedded: true,
            _host: hostObj,
            _record: rec,
            properties: {
                get: function (key) {
                    if (key === 'type') return 'splitter';
                    if (key === 'uniqueId') return rec.id;
                    if (key === 'name') return rec.name;
                    if (key === 'splitRatio') return rec.splitRatio;
                    if (key === 'inputFiber') {
                        if (rec.inputFiber) return rec.inputFiber;
                        if (rec.inputCableId && rec.inputFiberNumber != null) {
                            return { cableId: rec.inputCableId, fiberNumber: rec.inputFiberNumber };
                        }
                        return null;
                    }
                    if (key === 'outputConnections') return rec.outputConnections || [];
                    return null;
                },
                set: function (key, val) {
                    if (key === 'name') rec.name = val;
                    else if (key === 'splitRatio') rec.splitRatio = parseInt(val, 10) || DEFAULT_RATIO;
                    else if (key === 'inputFiber') {
                        rec.inputFiber = val;
                        rec.inputCableId = val && val.cableId ? val.cableId : null;
                        rec.inputFiberNumber = val && val.fiberNumber != null ? val.fiberNumber : null;
                    }
                    else if (key === 'outputConnections') rec.outputConnections = val;
                    if (!global._suppressMapSave && typeof global.saveData === 'function') global.saveData();
                }
            },
            geometry: null
        };
    }

    function resolve(splitterId) {
        var hit = findRecord(splitterId);
        if (hit) return createFacade(hit.host, hit.record);
        return findMapSplitter(splitterId);
    }

    function resolveName(splitterId) {
        var sp = resolve(splitterId);
        return sp && sp.properties ? (sp.properties.get('name') || 'Сплиттер') : 'Сплиттер';
    }

    function getAvailableForHost(hostObj, excludeId) {
        syncAllInputs(hostObj);
        return getList(hostObj).filter(function (rec) {
            if (excludeId && rec.id === excludeId) return false;
            return !rec.inputCableId;
        });
    }

    function getAvailableForOutput(sourceSplitterId) {
        var used = [];
        if (!global.objects) return [];
        global.objects.forEach(function (obj) {
            if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
            var outs = obj.properties.get('outputConnections') || [];
            outs.forEach(function (o) { if (o && o.splitterId) used.push(o.splitterId); });
        });
        global.objects.forEach(function (obj) {
            if (!isHost(obj)) return;
            getList(obj).forEach(function (rec) {
                (rec.outputConnections || []).forEach(function (o) {
                    if (o && o.splitterId) used.push(o.splitterId);
                });
            });
        });
        var out = [];
        global.objects.forEach(function (obj) {
            if (!isHost(obj)) return;
            getList(obj).forEach(function (rec) {
                if (rec.id === sourceSplitterId) return;
                if (used.indexOf(rec.id) !== -1) return;
                if (rec.inputCableId) return;
                out.push(createFacade(obj, rec));
            });
        });
        return out;
    }

    function defaultPosition(svgWidth, svgHeight, index, total) {
        var zone = getCenterZone(svgWidth, svgHeight);
        var cx = zone.x + zone.w / 2;
        var cy = zone.y + zone.h / 2;
        if (total <= 1) return clampPosition(cx, cy, svgWidth, svgHeight, DEFAULT_RATIO);
        var cols = Math.ceil(Math.sqrt(total));
        var row = Math.floor(index / cols);
        var col = index % cols;
        var rows = Math.ceil(total / cols);
        var gapX = 96;
        var gapY = 64;
        return clampPosition(
            cx + (col - (cols - 1) / 2) * gapX,
            cy + (row - (rows - 1) / 2) * gapY,
            svgWidth, svgHeight, DEFAULT_RATIO
        );
    }

    function clearSplitterOutputSlot(rec, outIdx) {
        if (!rec) return;
        var outs = rec.outputConnections || [];
        var oldOutput = outs[outIdx];
        if (!oldOutput) return;
        if (oldOutput.onuId && global.objects) {
            global.objects.forEach(function (o) {
                if (!o.properties || o.properties.get('type') !== 'onu') return;
                var uid = typeof global.getObjectUniqueId === 'function' ? global.getObjectUniqueId(o) : o.properties.get('uniqueId');
                if (uid === oldOutput.onuId) o.properties.set('incomingFiber', null);
            });
        } else if (oldOutput.mediaConverterId && global.objects) {
            global.objects.forEach(function (o) {
                if (!o.properties || o.properties.get('type') !== 'mediaConverter') return;
                var uid = typeof global.getObjectUniqueId === 'function' ? global.getObjectUniqueId(o) : o.properties.get('uniqueId');
                if (uid === oldOutput.mediaConverterId) o.properties.set('incomingFiber', null);
            });
        } else if (oldOutput.splitterId) {
            var hit = findRecord(oldOutput.splitterId);
            if (hit && hit.record) {
                hit.record.inputFiber = null;
                hit.record.inputCableId = null;
                hit.record.inputFiberNumber = null;
            }
        }
        outs[outIdx] = null;
        rec.outputConnections = outs;
    }

    function update(hostObj, splitterId, opts) {
        opts = opts || {};
        var list = getList(hostObj);
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        var idx = list.indexOf(rec);
        if (opts.name != null) {
            var n = String(opts.name).trim();
            if (n) rec.name = n;
        }
        var oldRatio = parseInt(rec.splitRatio, 10) || DEFAULT_RATIO;
        var newRatio = opts.splitRatio != null ? (parseInt(opts.splitRatio, 10) || DEFAULT_RATIO) : oldRatio;
        if (newRatio < oldRatio) {
            var outs = rec.outputConnections || [];
            for (var i = newRatio; i < outs.length; i++) clearSplitterOutputSlot(rec, i);
        }
        rec.splitRatio = newRatio;
        normalizeRecord(rec, idx >= 0 ? idx : 0);
        if (opts.schemeMirrored != null) rec.schemeMirrored = !!opts.schemeMirrored;
        if (rec.schemeX != null && rec.schemeY != null) {
            var c = clampPosition(rec.schemeX, rec.schemeY, opts.svgWidth || 800, opts.svgHeight || 400, newRatio);
            rec.schemeX = c.x;
            rec.schemeY = c.y;
        }
        hostObj.properties.set('embeddedSplitters', list);
        if (typeof global.saveData === 'function') global.saveData();
        return true;
    }

    function add(hostObj, opts) {
        opts = opts || {};
        var list = getList(hostObj);
        var pos = opts.schemeX != null && opts.schemeY != null
            ? { x: opts.schemeX, y: opts.schemeY }
            : defaultPosition(opts.svgWidth || 800, opts.svgHeight || 400, list.length, list.length + 1);
        var rec = normalizeRecord({
            id: opts.id || genId(),
            name: opts.name || ('Сплиттер ' + (list.length + 1)),
            splitRatio: opts.splitRatio || DEFAULT_RATIO,
            schemeX: pos.x,
            schemeY: pos.y,
            inputFiber: null,
            inputCableId: null,
            inputFiberNumber: null,
            outputConnections: []
        }, list.length);
        list.push(rec);
        hostObj.properties.set('embeddedSplitters', list);
        if (typeof global.saveData === 'function') global.saveData();
        return rec;
    }

    function remove(hostObj, splitterId) {
        var list = getList(hostObj);
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        var sc = hostObj.properties.get('splitterConnections') || {};
        Object.keys(sc).slice().forEach(function (key) {
            if (sc[key] && sc[key].splitterId === splitterId) delete sc[key];
        });
        hostObj.properties.set('splitterConnections', sc);
        if (typeof global.purgeSplitterGponTree === 'function') {
            global.purgeSplitterGponTree(createFacade(hostObj, rec));
        }
        hostObj.properties.set('embeddedSplitters', list.filter(function (r) { return r.id !== splitterId; }));
        if (typeof global.saveData === 'function') global.saveData();
        return true;
    }

    function move(hostObj, splitterId, x, y, svgWidth, svgHeight) {
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        var c = clampPosition(x, y, svgWidth || 800, svgHeight || 400, rec.splitRatio);
        rec.schemeX = c.x;
        rec.schemeY = c.y;
        if (typeof global.saveData === 'function') global.saveData();
        return true;
    }

    function migrateMapSplitterToHost(mapSplitter, hostObj) {
        if (!mapSplitter || !hostObj || !mapSplitter.properties) return null;
        var uid = typeof global.getObjectUniqueId === 'function'
            ? global.getObjectUniqueId(mapSplitter)
            : mapSplitter.properties.get('uniqueId');
        if (!uid) return null;
        if (findInHost(hostObj, uid)) return findInHost(hostObj, uid);
        var list = getList(hostObj);
        var idx = list.length;
        var pos = defaultPosition(800, 400, idx, idx + 1);
        var rec = normalizeRecord({
            id: uid,
            name: mapSplitter.properties.get('name') || ('Сплиттер ' + (idx + 1)),
            splitRatio: mapSplitter.properties.get('splitRatio') || DEFAULT_RATIO,
            schemeX: pos.x,
            schemeY: pos.y,
            inputFiber: mapSplitter.properties.get('inputFiber') || null,
            outputConnections: (mapSplitter.properties.get('outputConnections') || []).slice()
        }, idx);
        syncInputFromConnections(hostObj, rec);
        list.push(rec);
        hostObj.properties.set('embeddedSplitters', list);
        return rec;
    }

    function migrateAllFromMap() {
        if (!global.objects) return;
        var mapSplitters = global.objects.filter(function (o) {
            return o.properties && o.properties.get('type') === 'splitter';
        });
        mapSplitters.forEach(function (sp) {
            var uid = typeof global.getObjectUniqueId === 'function'
                ? global.getObjectUniqueId(sp)
                : sp.properties.get('uniqueId');
            if (!uid) return;
            var hostObj = null;
            if (typeof global.getSplitterHostInputFiber === 'function') {
                var hostIn = global.getSplitterHostInputFiber(sp);
                if (hostIn && hostIn.hostObj) hostObj = hostIn.hostObj;
            }
            if (!hostObj) {
                global.objects.forEach(function (slot) {
                    if (hostObj || !isHost(slot)) return;
                    var sc = slot.properties.get('splitterConnections') || {};
                    Object.keys(sc).forEach(function (key) {
                        if (!hostObj && sc[key] && sc[key].splitterId === uid) hostObj = slot;
                    });
                });
            }
            if (!hostObj) return;
            migrateMapSplitterToHost(sp, hostObj);
            if (typeof global.removeSplitterHostConnection === 'function') {
                /* keep splitterConnections */
            }
            try {
                if (global.myMap && sp.geometry) global.myMap.geoObjects.remove(sp);
                var lbl = sp.properties.get('label');
                if (lbl && global.myMap) global.myMap.geoObjects.remove(lbl);
            } catch (e) {}
            var oidx = global.objects.indexOf(sp);
            if (oidx >= 0) global.objects.splice(oidx, 1);
        });
        global.objects.forEach(function (o) {
            if (isHost(o)) syncAllInputs(o);
        });
    }

    function renderSchemeSplitters(hostObj, opts) {
        opts = opts || {};
        var esc = typeof global.escapeHtml === 'function' ? global.escapeHtml : function (s) { return s; };
        var list = getList(hostObj);
        syncAllInputs(hostObj);
        if (!list.length) return '';
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var fill = isDark ? '#431407' : '#fff7ed';
        var stroke = isDark ? '#fb923c' : '#ea580c';
        var textFill = isDark ? '#fed7aa' : '#9a3412';
        var svgW = opts.svgWidth || 800;
        var svgH = opts.svgHeight || 400;
        ensureAllInBounds(hostObj, svgW, svgH);
        list = getList(hostObj);
        var zone = getCenterZone(svgW, svgH);
        var zoneFill = isDark ? 'rgba(251,146,60,0.04)' : 'rgba(255,247,237,0.35)';
        var zoneStroke = isDark ? 'rgba(251,146,60,0.12)' : 'rgba(234,88,12,0.15)';
        var linkColor = isDark ? '#fb923c' : '#f97316';
        var linkShadow = isDark ? '#9a3412' : '#c2410c';
        var pathOpts = {
            buildConnectionPath: opts.buildConnectionPath,
            nodeR: opts.nodeR,
            badgeW: opts.badgeW,
            svgWidth: svgW
        };
        var renderOpts = {
            isEditMode: opts.isEditMode,
            pathMidpoint: opts.pathMidpoint,
            _linkLabels: []
        };
        var splitterConnections = opts.splitterConnections || {};
        var connLabelBg = isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.92)';
        var connLabelFill = isDark ? '#f1f5f9' : '#1e293b';
        var connLabelBorder = isDark ? '#334155' : '#dee2e6';
        var linksHtml = '<g class="fiber-scheme-splitter-links" fill="none">';
        var cardsHtml = '';
        list.forEach(function (rec, idx) {
            var def = defaultPosition(svgW, svgH, idx, list.length);
            var rawX = rec.schemeX != null ? rec.schemeX : def.x;
            var rawY = rec.schemeY != null ? rec.schemeY : def.y;
            var isMirrored = isSchemeMirrored(rec);
            var clamped = clampPosition(rawX, rawY, svgW, svgH, rec.splitRatio);
            var x = clamped.x;
            var y = clamped.y;
            if (rec.schemeX !== x || rec.schemeY !== y) {
                rec.schemeX = x;
                rec.schemeY = y;
            }
            var ratio = parseInt(rec.splitRatio, 10) || DEFAULT_RATIO;
            var box = computeSchemeSplitterBox(ratio);
            var w = box.w;
            var h = box.h;
            var layout = box;
            var title = esc(rec.name || ('Сплиттер ' + (idx + 1)));
            var shortTitle = title.length > (opts.isEditMode ? 14 : 16) ? title.substring(0, (opts.isEditMode ? 13 : 15)) + '…' : title;
            var hasIn = !!(rec.inputCableId && rec.inputFiberNumber != null);
            var bodyFill = isDark ? '#292524' : '#ffffff';
            var bodyStroke = isDark ? 'rgba(251,146,60,0.45)' : 'rgba(234,88,12,0.28)';
            var portIdle = isDark ? '#57534e' : '#d6d3d1';
            var portActive = '#22c55e';
            var portActiveStroke = '#15803d';
            var badgeFill = isDark ? 'rgba(251,146,60,0.18)' : 'rgba(254,243,199,0.95)';
            var badgeText = isDark ? '#fed7aa' : '#9a3412';
            var badgeY = box.HEADER_H + (opts.isEditMode ? 24 : 5);
            var badgeW = 52;
            var badgeH = 15;
            var badgeX = w / 2 - badgeW / 2;
            var titleClipId = 'fsp-title-' + String(rec.id).replace(/[^a-zA-Z0-9_-]/g, '');
            var titleClipW = Math.max(40, w - 30);
            var actionBg = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)';
            var actionIcon = isDark ? '#fed7aa' : '#9a3412';
            cardsHtml += '<g class="fiber-scheme-splitter' + (hasIn ? ' fiber-scheme-splitter--connected' : '') + (isMirrored ? ' fiber-scheme-splitter--mirrored' : '') + '" data-splitter-id="' + esc(rec.id) + '" data-scheme-mirrored="' + (isMirrored ? '1' : '0') + '" transform="translate(' + (x - w / 2) + ',' + (y - h / 2) + ')" filter="url(#fiberSplitterShadow)">';
            cardsHtml += '<title>' + title + ' · 1:' + ratio + (hasIn ? ' · вход ж.' + rec.inputFiberNumber : '') + (isMirrored ? ' · зерк.' : '') + '</title>';
            cardsHtml += '<rect class="fiber-scheme-splitter-body" x="0" y="0" width="' + w + '" height="' + h + '" rx="10" fill="' + bodyFill + '" stroke="' + bodyStroke + '" stroke-width="1.5"/>';
            cardsHtml += '<rect class="fiber-scheme-splitter-header" x="0" y="0" width="' + w + '" height="' + HEADER_H + '" rx="10" fill="url(#splitterHeaderGrad)"/>';
            cardsHtml += '<rect x="0" y="' + (HEADER_H - 6) + '" width="' + w + '" height="6" fill="url(#splitterHeaderGrad)"/>';
            if (isMirrored) {
                cardsHtml += '<g stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(9, 6)"><line x1="10" y1="5" x2="0" y2="5"/><line x1="3" y1="1" x2="-2" y2="5"/><line x1="3" y1="9" x2="-2" y2="5"/></g>';
            } else {
                cardsHtml += '<g stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(9, 6)"><line x1="0" y1="5" x2="10" y2="5"/><line x1="7" y1="1" x2="12" y2="5"/><line x1="7" y1="9" x2="12" y2="5"/></g>';
            }
            cardsHtml += '<clipPath id="' + titleClipId + '"><rect x="26" y="0" width="' + titleClipW + '" height="' + HEADER_H + '"/></clipPath>';
            cardsHtml += '<text x="28" y="16" clip-path="url(#' + titleClipId + ')" style="font-size:10px;font-weight:600;fill:#fff;pointer-events:none;">' + shortTitle + '</text>';
            if (opts.isEditMode) {
                cardsHtml += '<g class="fiber-scheme-splitter-actions" transform="translate(' + (w - HEADER_ACTIONS_W - 6) + ', ' + (HEADER_H + 4) + ')">';
                cardsHtml += '<rect class="fiber-scheme-splitter-rotate-hit" data-splitter-id="' + esc(rec.id) + '" x="0" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"><title>Отразить зеркально</title></rect>';
                cardsHtml += '<text class="fiber-scheme-splitter-rotate" data-splitter-id="' + esc(rec.id) + '" x="9" y="13" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">⇄</text>';
                cardsHtml += '<rect class="fiber-scheme-splitter-edit-hit" data-splitter-id="' + esc(rec.id) + '" x="20" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"/>';
                cardsHtml += '<text class="fiber-scheme-splitter-edit" data-splitter-id="' + esc(rec.id) + '" x="29" y="13" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">✎</text>';
                cardsHtml += '<rect class="fiber-scheme-splitter-delete-hit" data-splitter-id="' + esc(rec.id) + '" x="40" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"/>';
                cardsHtml += '<text class="fiber-scheme-splitter-delete" data-splitter-id="' + esc(rec.id) + '" x="49" y="13" text-anchor="middle" style="font-size:11px;fill:' + actionIcon + ';pointer-events:none;">×</text>';
                cardsHtml += '</g>';
            }
            cardsHtml += '<rect x="' + badgeX + '" y="' + badgeY + '" width="' + badgeW + '" height="' + badgeH + '" rx="7.5" fill="' + badgeFill + '"/>';
            cardsHtml += '<text x="' + (badgeX + badgeW / 2) + '" y="' + (badgeY + 10) + '" text-anchor="middle" style="font-size:8px;font-weight:700;fill:' + badgeText + ';pointer-events:none;">1:' + ratio + ' · ' + ratio + ' вых.</text>';
            var inPortFill = hasIn ? portActive : portIdle;
            var inPortStroke = hasIn ? portActiveStroke : bodyStroke;
            var inPortClass = 'fiber-scheme-splitter-input-port' + (hasIn ? ' fiber-scheme-splitter-input-port--connected' : '');
            if (opts.isEditMode && opts.wirePickSplitterId === rec.id) inPortClass += ' fiber-scheme-splitter-input-port--pick';
            var inPortPe = opts.isEditMode ? '' : ' pointer-events="none"';
            var inCy = inputPortLocalY(layout);
            if (!isMirrored) {
                cardsHtml += '<line x1="-8" y1="' + inCy + '" x2="0" y2="' + inCy + '" stroke="' + inPortStroke + '" stroke-width="2" pointer-events="none"/>';
                cardsHtml += '<circle class="' + inPortClass + '" data-splitter-id="' + esc(rec.id) + '" cx="-8" cy="' + inCy + '" r="5" fill="' + inPortFill + '" stroke="' + inPortStroke + '" stroke-width="1.5"' + inPortPe + '/>';
            } else {
                cardsHtml += '<line x1="' + w + '" y1="' + inCy + '" x2="' + (w + 8) + '" y2="' + inCy + '" stroke="' + inPortStroke + '" stroke-width="2" pointer-events="none"/>';
                cardsHtml += '<circle class="' + inPortClass + '" data-splitter-id="' + esc(rec.id) + '" cx="' + (w + 8) + '" cy="' + inCy + '" r="5" fill="' + inPortFill + '" stroke="' + inPortStroke + '" stroke-width="1.5"' + inPortPe + '/>';
            }
            var outs = rec.outputConnections || [];
            for (var pi = 0; pi < ratio; pi++) {
                var outConn = outs[pi];
                var portFill = outConn ? portActive : portIdle;
                var portStroke = outConn ? portActiveStroke : bodyStroke;
                var portClass = 'fiber-scheme-splitter-port' + (outConn ? ' fiber-scheme-splitter-port--connected' : '');
                if (opts.isEditMode && opts.outputPickSplitterId === rec.id && opts.outputPickIndex === pi) portClass += ' fiber-scheme-splitter-port--pick';
                var portCursor = opts.isEditMode && !outConn ? ' style="cursor:pointer"' : '';
                var portPe = opts.isEditMode && !outConn ? '' : ' pointer-events="none"';
                var py = outputPortLocalY(pi, ratio, layout);
                if (!isMirrored) {
                    cardsHtml += '<line x1="' + w + '" y1="' + py + '" x2="' + (w + 8) + '" y2="' + py + '" stroke="' + portStroke + '" stroke-width="2" pointer-events="none"/>';
                    cardsHtml += '<circle class="' + portClass + '" data-splitter-id="' + esc(rec.id) + '" data-output-index="' + pi + '" cx="' + (w + 8) + '" cy="' + py + '" r="' + box.portR + '" fill="' + portFill + '" stroke="' + portStroke + '" stroke-width="1.5"' + portCursor + portPe + '/>';
                } else {
                    cardsHtml += '<line x1="-8" y1="' + py + '" x2="0" y2="' + py + '" stroke="' + portStroke + '" stroke-width="2" pointer-events="none"/>';
                    cardsHtml += '<circle class="' + portClass + '" data-splitter-id="' + esc(rec.id) + '" data-output-index="' + pi + '" cx="-8" cy="' + py + '" r="' + box.portR + '" fill="' + portFill + '" stroke="' + portStroke + '" stroke-width="1.5"' + portCursor + portPe + '/>';
                }
            }
            cardsHtml += '</g>';
            if (opts.fiberPositions && pathOpts.buildConnectionPath) {
                var badgeW = pathOpts.badgeW || 22;
                if (hasIn) {
                    var fkey = fiberKey(rec.inputCableId, rec.inputFiberNumber);
                    var fpos = opts.fiberPositions.get(fkey);
                    if (fpos) {
                        var inPt = schemeSplitterPortPos(x, y, box, 'input', 0, ratio, isMirrored);
                        var inPathD = buildSplitterFiberPath(fpos, inPt.x, inPt.y, pathOpts);
                        var fex = fiberSchemeExitX(fpos, badgeW);
                        var inKey = fiberKey(rec.inputCableId, rec.inputFiberNumber);
                        var inLabel = (splitterConnections[inKey] && splitterConnections[inKey].label) ? splitterConnections[inKey].label : '';
                        linksHtml = appendSplitterLinkHtml(linksHtml, inPathD, rec, 'input', {
                            id: esc(rec.id),
                            label: inLabel,
                            extra: ' data-fiber-exit-x="' + fex + '" data-fiber-exit-y="' + fpos.y + '" data-fiber-is-left="' + (fpos.isLeft ? '1' : '0') + '" data-cable-id="' + esc(rec.inputCableId) + '" data-fiber-number="' + rec.inputFiberNumber + '"'
                        }, linkColor, linkShadow, renderOpts);
                    }
                }
                var hostUid = typeof global.getObjectUniqueId === 'function' ? global.getObjectUniqueId(hostObj) : null;
                for (var oi = 0; oi < ratio; oi++) {
                    var outLocal = outs[oi];
                    if (!outLocal || !outLocal.cableId || outLocal.fiberNumber == null) continue;
                    if (outLocal.onuId || outLocal.splitterId) continue;
                    if (outLocal.hostId && hostUid && outLocal.hostId !== hostUid) continue;
                    var ofkey = fiberKey(outLocal.cableId, outLocal.fiberNumber);
                    var opos = opts.fiberPositions.get(ofkey);
                    if (!opos) continue;
                    var outPt = schemeSplitterPortPos(x, y, box, 'output', oi, ratio, isMirrored);
                    var ox = outPt.x;
                    var oy = outPt.y;
                    var ofex = fiberSchemeExitX(opos, badgeW);
                    var outPathD = buildSplitterConnectionPath(ox, oy, ofex, opos.y, opos.isLeft, pathOpts);
                    var outLabel = (outLocal && outLocal.label) ? outLocal.label : '';
                    linksHtml = appendSplitterLinkHtml(linksHtml, outPathD, rec, 'output', {
                        id: esc(rec.id),
                        outputIndex: oi,
                        label: outLabel,
                        extra: ' data-output-index="' + oi + '" data-fiber-exit-x="' + ofex + '" data-fiber-exit-y="' + opos.y + '" data-fiber-is-left="' + (opos.isLeft ? '1' : '0') + '" data-cable-id="' + esc(outLocal.cableId) + '" data-fiber-number="' + outLocal.fiberNumber + '"'
                    }, linkColor, linkShadow, renderOpts);
                }
                for (var si = 0; si < ratio; si++) {
                    var spOut = outs[si];
                    if (!spOut || !spOut.splitterId) continue;
                    var tgtRec = findInHost(hostObj, spOut.splitterId);
                    if (!tgtRec) continue;
                    var tgtIdx = list.indexOf(tgtRec);
                    var tgtDef = defaultPosition(svgW, svgH, tgtIdx >= 0 ? tgtIdx : 0, list.length);
                    var tx = tgtRec.schemeX != null ? tgtRec.schemeX : tgtDef.x;
                    var ty = tgtRec.schemeY != null ? tgtRec.schemeY : tgtDef.y;
                    var tgtRatio = parseInt(tgtRec.splitRatio, 10) || DEFAULT_RATIO;
                    var tgtBox = computeSchemeSplitterBox(tgtRatio);
                    var srcPt = schemeSplitterPortPos(x, y, box, 'output', si, ratio, isMirrored);
                    var tgtPt = schemeSplitterPortPos(tx, ty, tgtBox, 'input', 0, tgtRatio, isSchemeMirrored(tgtRec));
                    var spPathD = buildSplitterConnectionPath(srcPt.x, srcPt.y, tgtPt.x, tgtPt.y, tgtPt.x < srcPt.x, pathOpts);
                    var spLabel = (spOut && spOut.label) ? spOut.label : '';
                    linksHtml = appendSplitterLinkHtml(linksHtml, spPathD, rec, 'output', {
                        id: esc(rec.id),
                        outputIndex: si,
                        label: spLabel,
                        extra: ' data-output-index="' + si + '" data-target-splitter-id="' + esc(spOut.splitterId) + '"'
                    }, linkColor, linkShadow, renderOpts);
                }
            }
        });
        linksHtml += '</g>';
        var labelsHtml = '';
        if (renderOpts._linkLabels && renderOpts._linkLabels.length) {
            labelsHtml += '<g class="fiber-scheme-splitter-link-labels">';
            renderOpts._linkLabels.forEach(function (item) {
                var mid = item.mid || { x: 0, y: 0 };
                var tw = Math.min(148, Math.max(40, item.label.length * 6.5 + 16));
                var tx = mid.x - tw / 2;
                labelsHtml += '<g class="fiber-scheme-splitter-conn-label" data-link-key="' + item.linkKey + '">';
                labelsHtml += '<rect class="fiber-scheme-splitter-conn-label-bg" x="' + tx + '" y="' + (mid.y - 11) + '" width="' + tw + '" height="21" rx="5" fill="' + connLabelBg + '" stroke="' + connLabelBorder + '" stroke-width="0.75"/>';
                labelsHtml += '<text class="fiber-scheme-splitter-conn-label-text" x="' + mid.x + '" y="' + (mid.y + 5) + '" text-anchor="middle" style="font-size:10px;font-weight:600;fill:' + connLabelFill + ';pointer-events:none;">' + esc(item.label) + '</text>';
                labelsHtml += '</g>';
            });
            labelsHtml += '</g>';
        }
        var html = '<g class="fiber-scheme-splitters">';
        html += linksHtml;
        if (opts.isEditMode) {
            html += '<rect class="fiber-scheme-splitter-zone" x="' + zone.x + '" y="' + zone.y + '" width="' + zone.w + '" height="' + zone.h + '" rx="12" fill="' + zoneFill + '" stroke="' + zoneStroke + '" stroke-width="1" stroke-dasharray="5 6" pointer-events="none"/>';
        }
        html += cardsHtml;
        html += labelsHtml;
        html += '</g>';
        return html;
    }

    function forEach(callback) {
        if (!global.objects || typeof callback !== 'function') return;
        global.objects.forEach(function (o) {
            if (o.properties && o.properties.get('type') === 'splitter') callback(o);
        });
        global.objects.forEach(function (o) {
            if (!isHost(o)) return;
            getList(o).forEach(function (rec) {
                callback(createFacade(o, rec));
            });
        });
    }

    global.EmbeddedSplitters = {
        HOST_TYPES: HOST_TYPES,
        isHost: isHost,
        getList: getList,
        findInHost: findInHost,
        findRecord: findRecord,
        resolve: resolve,
        resolveName: resolveName,
        createFacade: createFacade,
        getAvailableForHost: getAvailableForHost,
        getAvailableForOutput: getAvailableForOutput,
        forEach: forEach,
        add: add,
        update: update,
        remove: remove,
        move: move,
        toggleSchemeMirrored: toggleSchemeMirrored,
        isSchemeMirrored: isSchemeMirrored,
        clampPosition: clampPosition,
        getBounds: getBounds,
        getCenterZone: getCenterZone,
        ensureAllInBounds: ensureAllInBounds,
        resetAllPositions: resetAllPositions,
        splitterHeight: splitterHeight,
        computeSplitterLayout: computeSplitterLayout,
        computeSchemeSplitterBox: computeSchemeSplitterBox,
        outputPortLocalY: outputPortLocalY,
        inputPortLocalY: inputPortLocalY,
        schemeSplitterPortPos: schemeSplitterPortPos,
        updateSplitterLinkPaths: updateSplitterLinkPaths,
        getSchemeSplitterObstacles: getSchemeSplitterObstacles,
        syncAllInputs: syncAllInputs,
        syncInputFromConnections: syncInputFromConnections,
        migrateAllFromMap: migrateAllFromMap,
        renderSchemeSplitters: renderSchemeSplitters,
        DEFAULT_W: DEFAULT_W,
        DEFAULT_H: DEFAULT_H
    };
})(typeof window !== 'undefined' ? window : this);
