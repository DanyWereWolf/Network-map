/**
 * Сплиттеры внутри схемы муфты/кросса (не на карте).
 */
(function (global) {
    'use strict';

    var HOST_TYPES = ['sleeve', 'cross'];
    var DEFAULT_RATIO = 8;
    var DEFAULT_W = 120;
    var HEADER_ACTIONS_W = 98;
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

    function stableHash01(seed) {
        if (typeof global.fiberSchemeStableHash01 === 'function') {
            return global.fiberSchemeStableHash01(seed);
        }
        var s = String(seed == null ? '' : seed);
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967296;
    }

    /** Порты остаются равномерными; разведение жил — на маршруте, не на кружках. */
    function outputPortAxisJitter(pi, ratio) {
        return 0;
    }

    function outputPortLocalY(pi, ratio, layout, flipVertical) {
        var effPi = flipVertical ? (ratio - 1 - pi) : pi;
        var portTop = layout.HEADER_H + 8;
        var portBottom = layout.h - layout.FOOTER_PAD;
        if (ratio <= 1) return (portTop + portBottom) / 2;
        var y = portTop + (effPi / (ratio - 1)) * (portBottom - portTop);
        return y + outputPortAxisJitter(pi, ratio);
    }

    function inputPortLocalY(layout) {
        var portTop = layout.HEADER_H + 8;
        var portBottom = layout.h - layout.FOOTER_PAD;
        return (portTop + portBottom) / 2;
    }

    function outputPortLocalX(pi, ratio, layout, flipVertical) {
        var effPi = flipVertical ? (ratio - 1 - pi) : pi;
        var portLeft = 14;
        var portRight = layout.w - 14;
        if (ratio <= 1) return (portLeft + portRight) / 2;
        var x = portLeft + (effPi / (ratio - 1)) * (portRight - portLeft);
        return x + outputPortAxisJitter(pi, ratio);
    }

    function inputPortLocalX(layout) {
        return layout.w / 2;
    }

    function getSchemeOrientation(rec) {
        if (!rec) return 'horizontal';
        if (rec.schemeOrientation === 'vertical') return 'vertical';
        if (rec.schemeVertical === true) return 'vertical';
        return 'horizontal';
    }

    function isSchemeVertical(rec) {
        return getSchemeOrientation(rec) === 'vertical';
    }

    function isSchemeMirrored(rec) {
        if (!rec) return false;
        return !!rec.schemeMirrored;
    }

    function isSchemeFlipVertical(rec) {
        if (!rec) return false;
        return !!rec.schemeFlipVertical;
    }

    function computeVerticalSchemeSplitterBox(ratio) {
        ratio = parseInt(ratio, 10) || DEFAULT_RATIO;
        var portR = ratio > 16 ? 3 : (ratio > 8 ? 3.5 : 4.5);
        // Чуть шире шаг портов — при толстых жилах (4.5px) они не слипаются у края.
        var portGap = ratio > 8 ? 17 : PORT_GAP;
        var portAreaW = ratio <= 1 ? 48 : Math.max(88, (ratio - 1) * portGap + 28);
        if (ratio > 12) portAreaW = Math.max(portAreaW, ratio * 12);
        var h = HEADER_H + 34 + portR * 2 + FOOTER_PAD + 4;
        return {
            w: Math.max(104, portAreaW + 24),
            h: h,
            HEADER_H: HEADER_H,
            FOOTER_PAD: FOOTER_PAD,
            portR: portR,
            orientation: 'vertical'
        };
    }

    function computeSchemeSplitterBox(ratio, orientation) {
        orientation = orientation || 'horizontal';
        if (orientation === 'vertical') return computeVerticalSchemeSplitterBox(ratio);
        ratio = parseInt(ratio, 10) || DEFAULT_RATIO;
        var layout = computeSplitterLayout(ratio);
        return {
            w: DEFAULT_W,
            h: layout.h,
            HEADER_H: layout.HEADER_H,
            FOOTER_PAD: layout.FOOTER_PAD,
            portR: layout.portR,
            orientation: 'horizontal'
        };
    }

    function schemeSplitterPortPos(cx, cy, box, kind, outputIndex, ratio, mirrored, flipVertical, orientation) {
        orientation = orientation || box.orientation || 'horizontal';
        if (orientation === 'vertical') {
            var inX = cx - box.w / 2 + inputPortLocalX(box);
            var outX = cx - box.w / 2 + outputPortLocalX(outputIndex || 0, ratio, box, flipVertical);
            if (!mirrored) {
                if (kind === 'input') return { x: inX, y: cy - box.h / 2 - 8 };
                return { x: outX, y: cy + box.h / 2 + 8 };
            }
            if (kind === 'input') return { x: inX, y: cy + box.h / 2 + 8 };
            return { x: outX, y: cy - box.h / 2 - 8 };
        }
        var inY = cy - box.h / 2 + inputPortLocalY(box);
        var outY = cy - box.h / 2 + outputPortLocalY(outputIndex || 0, ratio, box, flipVertical);
        if (!mirrored) {
            if (kind === 'input') return { x: cx - box.w / 2 - 8, y: inY };
            return { x: cx + box.w / 2 + 8, y: outY };
        }
        if (kind === 'input') return { x: cx + box.w / 2 + 8, y: inY };
        return { x: cx - box.w / 2 - 8, y: outY };
    }

    function fiberSchemeFiberExitPoint(pos, badgeW, badgeH, nodeR) {
        badgeW = badgeW || 22;
        badgeH = badgeH || 16;
        nodeR = nodeR || 4;
        var gap = 2;
        if (pos && pos.isTop) {
            return { x: pos.x, y: pos.y + badgeH / 2 + nodeR + gap };
        }
        if (pos && pos.isLeft) {
            return { x: pos.x + badgeW / 2 + nodeR + gap, y: pos.y };
        }
        return { x: pos.x - badgeW / 2 - nodeR - gap, y: pos.y };
    }

    function fiberSchemeExitX(pos, badgeW) {
        return fiberSchemeFiberExitPoint(pos, badgeW).x;
    }

    function getBendPath(pathOpts) {
        if (pathOpts && pathOpts.buildBendPath) return pathOpts.buildBendPath;
        if (typeof global.buildFiberSchemeBendAtPointPath === 'function') return global.buildFiberSchemeBendAtPointPath;
        return null;
    }

    function getAroundPath() {
        if (typeof global.buildFiberSchemeAroundObstaclesPath === 'function') return global.buildFiberSchemeAroundObstaclesPath;
        return null;
    }

    /** Bounding box карточки сплиттера для обхода (визуальные границы + небольшой запас). */
    function splitterAvoidBox(cx, cy, box, pad) {
        pad = pad != null ? pad : 8;
        return {
            x: cx - box.w / 2 - pad,
            y: cy - box.h / 2 - pad,
            w: box.w + pad * 2,
            h: box.h + pad * 2,
            cx: cx,
            cy: cy
        };
    }

    function tryAroundObstacles(x1, y1, x2, y2, pathOpts) {
        var around = getAroundPath();
        if (!around) return null;
        var list = [];
        if (pathOpts && pathOpts.avoidBox) list.push(pathOpts.avoidBox);
        if (pathOpts && pathOpts.obstacles && pathOpts.obstacles.length) {
            for (var i = 0; i < pathOpts.obstacles.length; i++) {
                var obs = pathOpts.obstacles[i];
                if (!obs) continue;
                if (pathOpts.avoidBox &&
                    Math.abs(obs.cx - pathOpts.avoidBox.cx) < 2 &&
                    Math.abs(obs.cy - pathOpts.avoidBox.cy) < 2) {
                    continue;
                }
                list.push(obs);
            }
        }
        if (!list.length) return null;
        return around(x1, y1, x2, y2, list, {
            seed: pathOpts.routeSeed,
            stagger: pathOpts.routeStagger,
            preferLeft: pathOpts.preferLeft,
            preferAbove: pathOpts.preferAbove,
            stemStart: pathOpts.stemStart,
            stemEnd: pathOpts.stemEnd,
            laneIndex: pathOpts.laneIndex,
            cableApproachY: pathOpts.cableApproachY,
            cableApproachX: pathOpts.cableApproachX,
            pad: 20
        });
    }

    function getElbowPath() {
        if (typeof global.buildFiberSchemeElbowPath === 'function') return global.buildFiberSchemeElbowPath;
        return null;
    }

    function getAssignTopApproachYs() {
        if (typeof global.assignTopCrossLinkApproachYs === 'function') return global.assignTopCrossLinkApproachYs;
        return null;
    }

    function getAssignSideApproachXs() {
        if (typeof global.assignSideSplitterApproachXs === 'function') return global.assignSideSplitterApproachXs;
        return null;
    }

    function getOrthogonalWaypointsPath() {
        if (typeof global.buildFiberSchemeOrthogonalWaypointsPath === 'function') {
            return global.buildFiberSchemeOrthogonalWaypointsPath;
        }
        return null;
    }

    function buildOrthogonalPts(pts) {
        var fn = getOrthogonalWaypointsPath();
        if (fn) return fn(pts, { smooth: true, filletScale: 1.3 });
        if (!pts || pts.length < 2) return '';
        var parts = ['M ' + pts[0].x + ' ' + pts[0].y];
        for (var i = 1; i < pts.length; i++) parts.push('L ' + pts[i].x + ' ' + pts[i].y);
        return parts.join(' ');
    }

    function buildSplitterSchematicPath(x1, y1, x2, y2, pathOpts, preferHV) {
        var aroundD = tryAroundObstacles(x1, y1, x2, y2, pathOpts);
        if (aroundD) return aroundD;
        var elbow = getElbowPath();
        if (elbow) {
            return elbow(x1, y1, x2, y2, {
                preferHV: preferHV || 'vh',
                cableApproachY: pathOpts && pathOpts.cableApproachY,
                cableApproachX: pathOpts && pathOpts.cableApproachX,
                fiberAtStart: pathOpts && pathOpts.fiberAtStart
            });
        }
        var bend = getBendPath(pathOpts);
        if (bend) return bend(x1, y1, x2, y2, { bendStart: true, bendEnd: true });
        return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }

    /** Вход сплиттера — плавная изогнутая линия (не жёсткая Г). */
    function buildSplitterInputCurvedPath(x1, y1, x2, y2, pathOpts, fiberMeta, orientation, mirrored) {
        fiberMeta = fiberMeta || {};
        var aroundD = tryAroundObstacles(x1, y1, x2, y2, pathOpts);
        if (aroundD) return aroundD;
        // Верхний кабель: отступ жил у бейджа (дорожка cableApproachY), не изгиб на y жилы.
        if (fiberMeta.isTop && pathOpts && pathOpts.cableApproachY != null) {
            var elbowTop = getElbowPath();
            if (elbowTop) {
                return elbowTop(x1, y1, x2, y2, {
                    preferHV: 'vh',
                    cableApproachY: pathOpts.cableApproachY,
                    fiberAtStart: true
                });
            }
            return buildSplitterSchematicPath(x1, y1, x2, y2, pathOpts, 'vh');
        }
        var bend = getBendPath(pathOpts);
        if (bend) {
            var bendOpts = { bendStart: true, bendEnd: true };
            if (orientation === 'vertical') {
                // От боковой/верхней жилы к порту сверху/снизу — изгиб у обоих концов.
                bendOpts.bendStart = !!fiberMeta.isTop || fiberMeta.isLeft != null;
                bendOpts.bendEnd = true;
            } else {
                bendOpts.bendStart = !!fiberMeta.isTop;
                bendOpts.bendEnd = true;
            }
            return bend(x1, y1, x2, y2, bendOpts);
        }
        if (pathOpts && pathOpts.buildConnectionPath) {
            var nodeR = pathOpts.nodeR || 4;
            return pathOpts.buildConnectionPath(x1, y1, x2, y2, nodeR + 2, {
                sameSide: false,
                isLeft: !!fiberMeta.isLeft,
                isTop: !!fiberMeta.isTop,
                toTop: orientation === 'vertical' && !mirrored,
                svgWidth: pathOpts.svgWidth || 800,
                obstacles: pathOpts.obstacles || [],
                routeSeed: pathOpts.routeSeed,
                routeStagger: pathOpts.routeStagger,
                preferLeft: pathOpts.preferLeft
            });
        }
        return buildSplitterSchematicPath(x1, y1, x2, y2, pathOpts, 'vh');
    }

    /**
     * Режим отрисовки жилы↔сплиттер: отдельно горизонтальная и вертикальная карточка.
     * top-horizontal | top-vertical | side-horizontal | side-vertical
     */
    function resolveSplitterLinkMode(fiberMeta, orientation) {
        fiberMeta = fiberMeta || {};
        orientation = orientation || 'horizontal';
        if (fiberMeta.isTop) {
            return orientation === 'vertical' ? 'top-vertical' : 'top-horizontal';
        }
        return orientation === 'vertical' ? 'side-vertical' : 'side-horizontal';
    }

    /**
     * Вертикальный сплиттер ↔ боковой кабель.
     * Порты на одной горизонтали (верх/низ) — нельзя идти vh сквозь корпус:
     * сначала вынос от карточки, затем своя X-дорожка к жиле.
     */
    function buildVerticalSplitterSidePath(portX, portY, fiberX, fiberY, pathOpts, kind, mirrored, fiberIsLeft) {
        pathOpts = pathOpts || {};
        var box = pathOpts.avoidBox;
        var lane = pathOpts.laneIndex != null ? pathOpts.laneIndex : 0;
        var stem = pathOpts.stemStart != null ? pathOpts.stemStart : (16 + lane * 10);
        var leaveDown = kind === 'output' ? !mirrored : !!mirrored;
        var stemY = leaveDown ? (portY + stem) : (portY - stem);
        if (box) {
            if (leaveDown) stemY = Math.max(stemY, box.y + box.h + 10 + lane * 8);
            else stemY = Math.min(stemY, box.y - 10 - lane * 8);
        }

        var ax = resolveSideCableApproachX(fiberX, fiberIsLeft, pathOpts, box);
        var pts;
        if (kind === 'input') {
            pts = [
                { x: fiberX, y: fiberY },
                { x: ax, y: fiberY },
                { x: ax, y: stemY },
                { x: portX, y: stemY },
                { x: portX, y: portY }
            ];
        } else {
            pts = [
                { x: portX, y: portY },
                { x: portX, y: stemY },
                { x: ax, y: stemY },
                { x: ax, y: fiberY },
                { x: fiberX, y: fiberY }
            ];
        }
        return buildOrthogonalPts(pts);
    }

    /** X-дорожка перед боковым кабелем: изгиб до бейджа, снаружи корпуса сплиттера. */
    function resolveSideCableApproachX(fiberX, fiberIsLeft, pathOpts, box) {
        pathOpts = pathOpts || {};
        var lane = pathOpts.laneIndex != null ? pathOpts.laneIndex : 0;
        var minLead = 28 + lane * 10;
        var ax = pathOpts.cableApproachX;
        if (ax == null || isNaN(ax)) {
            ax = fiberIsLeft ? (fiberX + minLead) : (fiberX - minLead);
        }
        if (fiberIsLeft) {
            ax = Math.max(ax, fiberX + 22);
        } else {
            ax = Math.min(ax, fiberX - 22);
        }
        if (box) {
            if (fiberIsLeft) {
                // Коридор слева от карточки и справа от жилы — без затаскивания внутрь корпуса.
                var leftMax = box.x - 12;
                var leftMin = fiberX + 18;
                if (leftMin <= leftMax) ax = Math.max(leftMin, Math.min(leftMax, ax));
                else ax = leftMax;
            } else {
                var rightMin = box.x + box.w + 12;
                var rightMax = fiberX - 18;
                if (rightMin <= rightMax) ax = Math.max(rightMin, Math.min(rightMax, ax));
                else ax = rightMin;
            }
        }
        return ax;
    }

    /**
     * Горизонтальный сплиттер ↔ боковой кабель.
     * Сначала вынос НАРУЖУ от корпуса, затем к X-дорожке.
     * Если жила на противоположной стороне — обход сверху/снизу, не сквозь карточку.
     */
    function buildHorizontalSplitterSidePath(portX, portY, fiberX, fiberY, pathOpts, kind, fiberIsLeft) {
        pathOpts = pathOpts || {};
        var box = pathOpts.avoidBox;
        var lane = pathOpts.laneIndex != null ? pathOpts.laneIndex : 0;
        var ax = resolveSideCableApproachX(fiberX, fiberIsLeft, pathOpts, box);
        var boxCx = box ? (box.cx != null ? box.cx : (box.x + box.w / 2)) : portX;
        var portOnRight = portX >= boxCx;

        // Короткий вынос от порта наружу (не внутрь карточки).
        var exitX = portX + (portOnRight ? 1 : -1) * (12 + lane * 4);
        if (box) {
            if (portOnRight) exitX = Math.max(exitX, box.x + box.w + 10 + lane * 4);
            else exitX = Math.min(exitX, box.x - 10 - lane * 4);
        }

        var dy = Math.abs(portY - fiberY);
        var midY = fiberY;
        if (dy < 12) {
            var jogDir = (lane % 2 === 0) ? -1 : 1;
            midY = fiberY + jogDir * (16 + Math.floor(lane / 2) * 7);
        }

        var sameSide = box
            ? ((portOnRight && ax >= box.x + box.w - 2) || (!portOnRight && ax <= box.x + 2))
            : ((portOnRight && ax >= portX - 1) || (!portOnRight && ax <= portX + 1));

        var pts;
        if (!sameSide && box) {
            // Жила с другой стороны — обход под/над корпусом.
            var preferBelow = fiberY >= portY;
            var clearY = preferBelow
                ? Math.max(box.y + box.h + 12 + lane * 8, Math.max(portY, fiberY, midY) + 14)
                : Math.min(box.y - 12 - lane * 8, Math.min(portY, fiberY, midY) - 14);
            if (kind === 'input') {
                pts = [
                    { x: fiberX, y: fiberY },
                    { x: ax, y: fiberY },
                    { x: ax, y: clearY },
                    { x: exitX, y: clearY },
                    { x: exitX, y: portY },
                    { x: portX, y: portY }
                ];
            } else {
                pts = [
                    { x: portX, y: portY },
                    { x: exitX, y: portY },
                    { x: exitX, y: clearY },
                    { x: ax, y: clearY },
                    { x: ax, y: fiberY },
                    { x: fiberX, y: fiberY }
                ];
            }
        } else if (kind === 'input') {
            pts = [
                { x: fiberX, y: fiberY },
                { x: ax, y: fiberY },
                { x: ax, y: midY },
                { x: ax, y: portY },
                { x: exitX, y: portY },
                { x: portX, y: portY }
            ];
        } else {
            pts = [
                { x: portX, y: portY },
                { x: exitX, y: portY },
                { x: ax, y: portY },
                { x: ax, y: midY },
                { x: ax, y: fiberY },
                { x: fiberX, y: fiberY }
            ];
        }
        return buildOrthogonalPts(pts);
    }

    /**
     * Горизонтальный сплиттер ↔ верхний кабель.
     * Все порты на одном X — прямой подъём сливает жилы у края карточки.
     * Вынос наружу по Y порта, затем дорожка approachY НАД корпусом.
     */
    function buildHorizontalSplitterTopPath(portX, portY, fiberX, fiberY, pathOpts, kind, mirrored) {
        pathOpts = pathOpts || {};
        var box = pathOpts.avoidBox;
        var lane = pathOpts.laneIndex != null ? pathOpts.laneIndex : 0;
        var ay = pathOpts.cableApproachY;
        if (ay == null || isNaN(ay)) ay = fiberY + 22 + lane * 10;
        ay = Math.max(fiberY + 16, ay);

        // Выходы справа (!mirrored) — колонка правее порта; вход слева — левее.
        var leaveRight = kind === 'output' ? !mirrored : !!mirrored;
        var riserX = pathOpts.portRiserX;
        if (riserX == null || isNaN(riserX)) {
            riserX = portX + (leaveRight ? 1 : -1) * (14 + lane * 11);
        }
        if (box) {
            if (leaveRight) riserX = Math.max(riserX, box.x + box.w + 10 + lane * 6);
            else riserX = Math.min(riserX, box.x - 10 - lane * 6);
            // Дорожка строго над корпусом — иначе горизонталь режет карточку.
            if (ay > box.y - 8) {
                ay = Math.min(ay, box.y - 12);
                ay = Math.max(fiberY + 16, ay);
            }
        }

        var pts;
        if (kind === 'input') {
            pts = [
                { x: fiberX, y: fiberY },
                { x: fiberX, y: ay },
                { x: riserX, y: ay },
                { x: riserX, y: portY },
                { x: portX, y: portY }
            ];
        } else {
            pts = [
                { x: portX, y: portY },
                { x: riserX, y: portY },
                { x: riserX, y: ay },
                { x: fiberX, y: ay },
                { x: fiberX, y: fiberY }
            ];
        }
        return buildOrthogonalPts(pts);
    }

    function buildVerticalPortRoute(x1, y1, x2, y2, pathOpts, bendMode) {
        return buildSplitterSchematicPath(x1, y1, x2, y2, pathOpts, 'vh');
    }

    function buildSplitterLinkPath(fromX, fromY, toX, toY, fiberMeta, pathOpts, orientation, kind, mirrored) {
        fiberMeta = fiberMeta || {};
        orientation = orientation || 'horizontal';
        mirrored = !!mirrored;
        kind = kind || 'output';

        var localOpts = pathOpts;
        if (fiberMeta.routeSeed != null || fiberMeta.routeStagger != null || fiberMeta.preferLeft != null || fiberMeta.avoidBox || fiberMeta.stemStart != null || fiberMeta.stemEnd != null || fiberMeta.laneIndex != null || fiberMeta.cableApproachY != null || fiberMeta.cableApproachX != null || fiberMeta.portRiserX != null) {
            localOpts = withRouteMeta(pathOpts, {
                routeSeed: fiberMeta.routeSeed != null ? fiberMeta.routeSeed : pathOpts.routeSeed,
                routeStagger: fiberMeta.routeStagger != null ? fiberMeta.routeStagger : pathOpts.routeStagger,
                preferLeft: fiberMeta.preferLeft != null ? fiberMeta.preferLeft : pathOpts.preferLeft,
                avoidBox: fiberMeta.avoidBox || pathOpts.avoidBox,
                stemStart: fiberMeta.stemStart != null ? fiberMeta.stemStart : pathOpts.stemStart,
                stemEnd: fiberMeta.stemEnd != null ? fiberMeta.stemEnd : pathOpts.stemEnd,
                laneIndex: fiberMeta.laneIndex != null ? fiberMeta.laneIndex : pathOpts.laneIndex,
                cableApproachY: fiberMeta.cableApproachY != null ? fiberMeta.cableApproachY : pathOpts.cableApproachY,
                cableApproachX: fiberMeta.cableApproachX != null ? fiberMeta.cableApproachX : pathOpts.cableApproachX,
                portRiserX: fiberMeta.portRiserX != null ? fiberMeta.portRiserX : pathOpts.portRiserX,
                // input: жила в начале пути; output: жила в конце
                fiberAtStart: kind === 'input' ? !!fiberMeta.isTop : false
            });
        } else if (fiberMeta.isTop && kind === 'output') {
            localOpts = withRouteMeta(pathOpts, { fiberAtStart: false });
        }

        var mode = resolveSplitterLinkMode(fiberMeta, orientation);

        if (mode === 'side-vertical') {
            if (kind === 'input') {
                return buildVerticalSplitterSidePath(toX, toY, fromX, fromY, localOpts, 'input', mirrored, fiberMeta.isLeft);
            }
            return buildVerticalSplitterSidePath(fromX, fromY, toX, toY, localOpts, 'output', mirrored, fiberMeta.isLeft);
        }

        if (mode === 'side-horizontal') {
            if (kind === 'input') {
                return buildHorizontalSplitterSidePath(toX, toY, fromX, fromY, localOpts, 'input', fiberMeta.isLeft);
            }
            return buildHorizontalSplitterSidePath(fromX, fromY, toX, toY, localOpts, 'output', fiberMeta.isLeft);
        }

        if (mode === 'top-horizontal') {
            if (kind === 'input') {
                return buildHorizontalSplitterTopPath(toX, toY, fromX, fromY, localOpts, 'input', mirrored);
            }
            return buildHorizontalSplitterTopPath(fromX, fromY, toX, toY, localOpts, 'output', mirrored);
        }

        if (kind === 'input') {
            return buildSplitterInputCurvedPath(fromX, fromY, toX, toY, localOpts, fiberMeta, orientation, mirrored);
        }

        // top-vertical: порты на разных X — vh + cableApproachY
        return buildSplitterSchematicPath(fromX, fromY, toX, toY, localOpts, 'vh');
    }

    function buildSplitterChainPath(srcPt, tgtPt, srcOrient, tgtOrient, srcMirrored, tgtMirrored, pathOpts) {
        if (!srcPt || !tgtPt) return '';
        srcOrient = srcOrient || 'horizontal';
        tgtOrient = tgtOrient || 'horizontal';
        var preferHV = (srcOrient === 'vertical' || tgtOrient === 'vertical') ? 'vh' : 'hv';
        return buildSplitterSchematicPath(srcPt.x, srcPt.y, tgtPt.x, tgtPt.y, pathOpts, preferHV);
    }

    function buildSplitterConnectionPath(x1, y1, x2, y2, fiberIsLeft, pathOpts, routeOpts) {
        return buildSplitterSchematicPath(x1, y1, x2, y2, pathOpts, 'vh');
    }

    function buildSplitterFiberPath(fiberPos, portX, portY, pathOpts) {
        if (!fiberPos || !pathOpts) return '';
        var badgeW = pathOpts.badgeW || 22;
        var badgeH = pathOpts.badgeH || 16;
        var nodeR = pathOpts.nodeR || 4;
        var exitPt = fiberSchemeFiberExitPoint(fiberPos, badgeW, badgeH, nodeR);
        return buildSplitterInputCurvedPath(
            exitPt.x, exitPt.y, portX, portY, pathOpts,
            { isLeft: fiberPos.isLeft, isTop: fiberPos.isTop, fiberPos: fiberPos },
            fiberPos.isTop ? 'vertical' : 'horizontal',
            false
        );
    }

    function buildRouteMeta(splitterId, kind, outputIndex, portX, boxCx, fiberIsLeft) {
        var seed = String(splitterId || 'sp') + ':' + (kind || 'out') + ':' + (outputIndex != null ? outputIndex : 'in');
        var hash = stableHash01(seed);
        var lane = outputIndex != null ? outputIndex : 0;
        // Сторона обхода — от кабеля, а не от половины карточки (иначе правые порты → левый кабель идут «не туда»).
        var preferLeft = fiberIsLeft != null
            ? !!fiberIsLeft
            : (portX != null && boxCx != null ? portX <= boxCx : hash < 0.5);
        var stemStart = 18 + lane * 11 + hash * 6;
        var stemEnd = 12 + lane * 4 + stableHash01(seed + ':exit') * 6;
        var stagger = 14 + lane * 10 + hash * 8;
        return {
            routeSeed: seed,
            routeStagger: stagger,
            preferLeft: preferLeft,
            stemStart: stemStart,
            stemEnd: stemEnd,
            laneIndex: lane
        };
    }

    function withRouteMeta(pathOpts, meta) {
        if (!meta) return pathOpts;
        return {
            buildConnectionPath: pathOpts.buildConnectionPath,
            buildBendPath: pathOpts.buildBendPath,
            nodeR: pathOpts.nodeR,
            badgeW: pathOpts.badgeW,
            badgeH: pathOpts.badgeH,
            svgWidth: pathOpts.svgWidth,
            svgHeight: pathOpts.svgHeight,
            hostObj: pathOpts.hostObj,
            obstacles: pathOpts.obstacles,
            avoidBox: meta.avoidBox != null ? meta.avoidBox : pathOpts.avoidBox,
            routeSeed: meta.routeSeed,
            routeStagger: meta.routeStagger,
            preferLeft: meta.preferLeft,
            stemStart: meta.stemStart != null ? meta.stemStart : pathOpts.stemStart,
            stemEnd: meta.stemEnd != null ? meta.stemEnd : pathOpts.stemEnd,
            laneIndex: meta.laneIndex != null ? meta.laneIndex : pathOpts.laneIndex,
            cableApproachY: meta.cableApproachY != null ? meta.cableApproachY : pathOpts.cableApproachY,
            cableApproachX: meta.cableApproachX != null ? meta.cableApproachX : pathOpts.cableApproachX,
            portRiserX: meta.portRiserX != null ? meta.portRiserX : pathOpts.portRiserX,
            fiberAtStart: meta.fiberAtStart != null ? meta.fiberAtStart : pathOpts.fiberAtStart
        };
    }

    /** Дорожки под верхним кабелем, чтобы жилы не сливались у бейджей. */
    function buildTopCableSplitterApproachMap(entries) {
        var assignFn = getAssignTopApproachYs();
        if (!assignFn || !entries || !entries.length) return new Map();
        var maxFy = null;
        entries.forEach(function (e) {
            if (e && e.fy != null && !isNaN(e.fy)) {
                maxFy = maxFy == null ? e.fy : Math.max(maxFy, e.fy);
            }
        });
        if (maxFy == null) return new Map();
        // База чуть ниже кабеля; полосы уходят вверх к жилам (как у кросса).
        var baseApproachY = maxFy + 22 + Math.max(0, entries.length - 1) * 10;
        return assignFn(entries, baseApproachY);
    }

    /** Дорожки у бокового кабеля для вертикального сплиттера. */
    function buildSideCableSplitterApproachMap(entries, isLeft) {
        var assignFn = getAssignSideApproachXs();
        if (!assignFn || !entries || !entries.length) return new Map();
        var baseFx = null;
        entries.forEach(function (e) {
            if (e && e.fx != null && !isNaN(e.fx)) {
                baseFx = baseFx == null ? e.fx : (isLeft ? Math.max(baseFx, e.fx) : Math.min(baseFx, e.fx));
            }
        });
        if (baseFx == null) return new Map();
        var baseApproachX = isLeft
            ? (baseFx + 28 + Math.max(0, entries.length - 1) * 4)
            : (baseFx - 28 - Math.max(0, entries.length - 1) * 4);
        return assignFn(entries, baseApproachX, { towardLeft: !isLeft });
    }

    function setSplitterLinkPathD(pathEl, d) {
        if (!pathEl || !d) return;
        pathEl.setAttribute('d', d);
        var prev = pathEl.previousElementSibling;
        if (prev && prev.classList && prev.classList.contains('fiber-scheme-splitter-link-shadow')) {
            prev.setAttribute('d', d);
        }
        var next = pathEl.nextElementSibling;
        if (next && next.classList && next.classList.contains('fiber-scheme-splitter-link-hit')) {
            next.setAttribute('d', d);
        }
    }

    function getSchemeSplitterObstacles(hostObj, svgWidth, svgHeight) {
        if (!isHost(hostObj)) return [];
        var list = getList(hostObj);
        var obstacles = [];
        list.forEach(function (rec, idx) {
            var def = defaultPosition(svgWidth, svgHeight, idx, list.length);
            var rawX = rec.schemeX != null ? rec.schemeX : def.x;
            var rawY = rec.schemeY != null ? rec.schemeY : def.y;
            var clamped = clampPosition(rawX, rawY, svgWidth, svgHeight, rec.splitRatio, getSchemeOrientation(rec));
            var box = computeSchemeSplitterBox(rec.splitRatio, getSchemeOrientation(rec));
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
        var box = computeSchemeSplitterBox(ratio, getSchemeOrientation(rec));
        return schemeSplitterPortPos(x, y, box, portKind, outputIndex, ratio, isSchemeMirrored(rec), isSchemeFlipVertical(rec), getSchemeOrientation(rec));
    }

    function updateSplitterLinkPaths(svg, splitterId, cx, cy, splitRatio, pathOpts) {
        if (!svg || !pathOpts || !pathOpts.buildConnectionPath) return;
        var ratio = parseInt(splitRatio, 10) || DEFAULT_RATIO;
        var mirrored = false;
        var flipVertical = false;
        var orientation = 'horizontal';
        if (pathOpts.hostObj) {
            var recLink = findInHost(pathOpts.hostObj, splitterId);
            if (recLink) {
                mirrored = isSchemeMirrored(recLink);
                flipVertical = isSchemeFlipVertical(recLink);
                orientation = getSchemeOrientation(recLink);
            }
        }
        var box = computeSchemeSplitterBox(ratio, orientation);
        var avoidBox = splitterAvoidBox(cx, cy, box, 8);
        var inPort = schemeSplitterPortPos(cx, cy, box, 'input', 0, ratio, mirrored, flipVertical, orientation);
        var inPortX = inPort.x;
        var inPortY = inPort.y;
        var svgW = pathOpts.svgWidth || 800;
        var svgH = pathOpts.svgHeight || 400;
        if (!pathOpts.obstacles && pathOpts.hostObj) {
            pathOpts.obstacles = getSchemeSplitterObstacles(pathOpts.hostObj, svgW, svgH);
        }
        pathOpts.avoidBox = avoidBox;
        var topUpdateEntries = [];
        var leftUpdateEntries = [];
        var rightUpdateEntries = [];
        svg.querySelectorAll('.fiber-scheme-splitter-link[data-splitter-id="' + splitterId + '"]').forEach(function (pathEl) {
            if (pathEl.getAttribute('data-target-splitter-id')) return;
            var isTopFiber = pathEl.getAttribute('data-fiber-is-top') === '1';
            var isLeftFiber = pathEl.getAttribute('data-fiber-is-left') === '1';
            var kind = pathEl.getAttribute('data-link-kind');
            var fx = parseFloat(pathEl.getAttribute('data-fiber-exit-x'));
            var fy = parseFloat(pathEl.getAttribute('data-fiber-exit-y'));
            if (isNaN(fx) || isNaN(fy)) return;
            var portX;
            var portY;
            var approachKey;
            if (kind === 'input') {
                portX = inPortX;
                portY = inPortY;
                approachKey = 'in:' + fiberKey(pathEl.getAttribute('data-cable-id'), pathEl.getAttribute('data-fiber-number')) + ':' + splitterId;
            } else if (kind === 'output') {
                var oiCollect = parseInt(pathEl.getAttribute('data-output-index'), 10);
                if (isNaN(oiCollect)) return;
                var outPortCollect = schemeSplitterPortPos(cx, cy, box, 'output', oiCollect, ratio, mirrored, flipVertical, orientation);
                portX = outPortCollect.x;
                portY = outPortCollect.y;
                approachKey = 'out:' + fiberKey(pathEl.getAttribute('data-cable-id'), pathEl.getAttribute('data-fiber-number')) + ':' + splitterId + ':' + oiCollect;
            } else return;
            if (isTopFiber) {
                topUpdateEntries.push({ fiberKey: approachKey, fx: fx, px: portX, fy: fy, py: portY });
            } else {
                var sideEntry = { fiberKey: approachKey, fx: fx, px: portX, fy: fy, py: portY };
                if (isLeftFiber) leftUpdateEntries.push(sideEntry);
                else rightUpdateEntries.push(sideEntry);
            }
        });
        var topUpdateMap = buildTopCableSplitterApproachMap(topUpdateEntries);
        var leftUpdateMap = buildSideCableSplitterApproachMap(leftUpdateEntries, true);
        var rightUpdateMap = buildSideCableSplitterApproachMap(rightUpdateEntries, false);
        svg.querySelectorAll('.fiber-scheme-splitter-link[data-splitter-id="' + splitterId + '"]').forEach(function (pathEl) {
            if (pathEl.getAttribute('data-target-splitter-id')) return;
            var kind = pathEl.getAttribute('data-link-kind');
            var fx = parseFloat(pathEl.getAttribute('data-fiber-exit-x'));
            var fy = parseFloat(pathEl.getAttribute('data-fiber-exit-y'));
            var isLeft = pathEl.getAttribute('data-fiber-is-left') === '1';
            var isTopFiber = pathEl.getAttribute('data-fiber-is-top') === '1';
            if (isNaN(fx) || isNaN(fy)) return;
            var portX;
            var portY;
            var d;
            var cableAy = null;
            var cableAx = null;
            if (kind === 'input') {
                portX = inPortX;
                portY = inPortY;
                var inMeta = buildRouteMeta(splitterId, 'input', null, portX, cx, isTopFiber ? null : isLeft);
                inMeta.isLeft = isLeft;
                inMeta.isTop = isTopFiber;
                inMeta.avoidBox = avoidBox;
                var inKey = 'in:' + fiberKey(pathEl.getAttribute('data-cable-id'), pathEl.getAttribute('data-fiber-number')) + ':' + splitterId;
                if (isTopFiber) {
                    cableAy = topUpdateMap.has(inKey) ? topUpdateMap.get(inKey) : (fy + 22);
                    inMeta.cableApproachY = cableAy;
                } else {
                    if (isLeft) {
                        cableAx = leftUpdateMap.has(inKey) ? leftUpdateMap.get(inKey) : (fx + 28);
                    } else {
                        cableAx = rightUpdateMap.has(inKey) ? rightUpdateMap.get(inKey) : (fx - 28);
                    }
                    inMeta.cableApproachX = cableAx;
                }
                d = buildSplitterLinkPath(fx, fy, portX, portY, inMeta, pathOpts, orientation, 'input', mirrored);
            } else if (kind === 'output') {
                var oi = parseInt(pathEl.getAttribute('data-output-index'), 10);
                if (isNaN(oi)) return;
                var outPort = schemeSplitterPortPos(cx, cy, box, 'output', oi, ratio, mirrored, flipVertical, orientation);
                portX = outPort.x;
                portY = outPort.y;
                var outMeta = buildRouteMeta(splitterId, 'output', oi, portX, cx, isTopFiber ? null : isLeft);
                outMeta.isLeft = isLeft;
                outMeta.isTop = isTopFiber;
                outMeta.avoidBox = avoidBox;
                var outKey = 'out:' + fiberKey(pathEl.getAttribute('data-cable-id'), pathEl.getAttribute('data-fiber-number')) + ':' + splitterId + ':' + oi;
                if (isTopFiber) {
                    cableAy = topUpdateMap.has(outKey) ? topUpdateMap.get(outKey) : (fy + 22);
                    outMeta.cableApproachY = cableAy;
                } else {
                    if (isLeft) {
                        cableAx = leftUpdateMap.has(outKey) ? leftUpdateMap.get(outKey) : (fx + 28);
                    } else {
                        cableAx = rightUpdateMap.has(outKey) ? rightUpdateMap.get(outKey) : (fx - 28);
                    }
                    outMeta.cableApproachX = cableAx;
                }
                d = buildSplitterLinkPath(portX, portY, fx, fy, outMeta, pathOpts, orientation, 'output', mirrored);
            } else return;
            setSplitterLinkPathD(pathEl, d);
        });
        var hostObj = pathOpts.hostObj;
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
                srcPort = schemeSplitterPortPos(cx, cy, box, 'output', oi, ratio, mirrored, flipVertical, orientation);
            }
            if (tgtId === splitterId && cx != null && cy != null) {
                var tgtRec = findInHost(hostObj, tgtId);
                var tgtRatio = tgtRec ? parseInt(tgtRec.splitRatio, 10) || DEFAULT_RATIO : ratio;
                var tgtBox = computeSchemeSplitterBox(tgtRatio, getSchemeOrientation(tgtRec));
                var tgtMirrored = tgtRec ? isSchemeMirrored(tgtRec) : false;
                var tgtFlipV = tgtRec ? isSchemeFlipVertical(tgtRec) : false;
                var tgtOrient = tgtRec ? getSchemeOrientation(tgtRec) : 'horizontal';
                tgtPort = schemeSplitterPortPos(cx, cy, tgtBox, 'input', 0, tgtRatio, tgtMirrored, tgtFlipV, tgtOrient);
            }
            if (!srcPort || !tgtPort) return;
            var srcRec = findInHost(hostObj, srcId);
            var tgtRec2 = findInHost(hostObj, tgtId);
            var chainMeta = buildRouteMeta(srcId, 'chain', oi, srcPort.x, srcPort.x);
            var chainOpts = withRouteMeta(pathOpts, chainMeta);
            var d = buildSplitterChainPath(
                srcPort, tgtPort,
                srcRec ? getSchemeOrientation(srcRec) : 'horizontal',
                tgtRec2 ? getSchemeOrientation(tgtRec2) : 'horizontal',
                srcRec ? isSchemeMirrored(srcRec) : false,
                tgtRec2 ? isSchemeMirrored(tgtRec2) : false,
                chainOpts
            );
            setSplitterLinkPathD(pathEl, d);
        });
    }

    function splitterHeight(splitRatio, orientation) {
        return computeSchemeSplitterBox(splitRatio, orientation).h;
    }

    function getBounds(svgWidth, svgHeight, splitRatio, orientation) {
        var box = computeSchemeSplitterBox(splitRatio, orientation);
        var halfW = box.w / 2;
        var halfH = box.h / 2;
        return {
            minX: halfW + BOUNDS_PAD,
            maxX: Math.max(halfW + BOUNDS_PAD, (svgWidth || 800) - halfW - BOUNDS_PAD),
            minY: halfH + BOUNDS_PAD,
            maxY: Math.max(halfH + BOUNDS_PAD, (svgHeight || 400) - halfH - BOUNDS_PAD)
        };
    }

    function clampPosition(x, y, svgWidth, svgHeight, splitRatio, orientation) {
        var b = getBounds(svgWidth, svgHeight, splitRatio, orientation);
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
            var c = clampPosition(rec.schemeX, rec.schemeY, svgWidth, svgHeight, rec.splitRatio, getSchemeOrientation(rec));
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
            var c = clampPosition(rawX, rawY, svgWidth, svgHeight, rec.splitRatio, getSchemeOrientation(rec));
            rec.schemeX = c.x;
            rec.schemeY = c.y;
        });
        if (typeof global.saveData === 'function') global.saveData();
    }

    function toggleSchemeOrientation(hostObj, splitterId, svgWidth, svgHeight) {
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        rec.schemeOrientation = isSchemeVertical(rec) ? 'horizontal' : 'vertical';
        if (rec.schemeX != null && rec.schemeY != null) {
            var c = clampPosition(rec.schemeX, rec.schemeY, svgWidth || 800, svgHeight || 400, rec.splitRatio, getSchemeOrientation(rec));
            rec.schemeX = c.x;
            rec.schemeY = c.y;
        }
        hostObj.properties.set('embeddedSplitters', getList(hostObj));
        if (typeof global.saveData === 'function') global.saveData();
        return true;
    }

    function toggleSchemeMirrored(hostObj, splitterId, svgWidth, svgHeight) {
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        rec.schemeMirrored = !isSchemeMirrored(rec);
        if (rec.schemeX != null && rec.schemeY != null) {
            var c = clampPosition(rec.schemeX, rec.schemeY, svgWidth || 800, svgHeight || 400, rec.splitRatio, getSchemeOrientation(rec));
            rec.schemeX = c.x;
            rec.schemeY = c.y;
        }
        hostObj.properties.set('embeddedSplitters', getList(hostObj));
        if (typeof global.saveData === 'function') global.saveData();
        return true;
    }

    function toggleSchemeFlipVertical(hostObj, splitterId, svgWidth, svgHeight) {
        var rec = findInHost(hostObj, splitterId);
        if (!rec) return false;
        rec.schemeFlipVertical = !isSchemeFlipVertical(rec);
        if (rec.schemeX != null && rec.schemeY != null) {
            var c = clampPosition(rec.schemeX, rec.schemeY, svgWidth || 800, svgHeight || 400, rec.splitRatio, getSchemeOrientation(rec));
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
        if (rec.schemeFlipVertical == null) rec.schemeFlipVertical = false;
        rec.schemeOrientation = getSchemeOrientation(rec) === 'vertical' ? 'vertical' : 'horizontal';
        if (typeof global.ensureSplitterOutputLabels === 'function') {
            global.ensureSplitterOutputLabels(rec, rec.splitRatio);
        }
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
        if (opts.schemeFlipVertical != null) rec.schemeFlipVertical = !!opts.schemeFlipVertical;
        if (opts.schemeOrientation != null) {
            rec.schemeOrientation = opts.schemeOrientation === 'vertical' ? 'vertical' : 'horizontal';
        }
        if (rec.schemeX != null && rec.schemeY != null) {
            var c = clampPosition(rec.schemeX, rec.schemeY, opts.svgWidth || 800, opts.svgHeight || 400, newRatio, getSchemeOrientation(rec));
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
        var c = clampPosition(x, y, svgWidth || 800, svgHeight || 400, rec.splitRatio, getSchemeOrientation(rec));
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
            buildBendPath: opts.buildBendPath,
            nodeR: opts.nodeR,
            badgeW: opts.badgeW,
            badgeH: opts.badgeH || 16,
            svgWidth: svgW,
            svgHeight: svgH,
            hostObj: hostObj,
            obstacles: getSchemeSplitterObstacles(hostObj, svgW, svgH)
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
        // Дорожки подхода: верхний кабель (Y) и боковые кабели (X) — для обеих ориентаций.
        var topApproachEntries = [];
        var leftApproachEntries = [];
        var rightApproachEntries = [];
        if (opts.fiberPositions) {
            var badgeWCollect = pathOpts.badgeW || 22;
            var badgeHCollect = pathOpts.badgeH || 16;
            var nodeRCollect = pathOpts.nodeR || 4;
            list.forEach(function (rec, idx) {
                var def = defaultPosition(svgW, svgH, idx, list.length);
                var rawX = rec.schemeX != null ? rec.schemeX : def.x;
                var rawY = rec.schemeY != null ? rec.schemeY : def.y;
                var isMirrored = isSchemeMirrored(rec);
                var isFlipV = isSchemeFlipVertical(rec);
                var orient = getSchemeOrientation(rec);
                var clamped = clampPosition(rawX, rawY, svgW, svgH, rec.splitRatio, orient);
                var x = clamped.x;
                var y = clamped.y;
                var ratio = parseInt(rec.splitRatio, 10) || DEFAULT_RATIO;
                var box = computeSchemeSplitterBox(ratio, orient);
                var hasIn = !!(rec.inputCableId && rec.inputFiberNumber != null);
                if (hasIn) {
                    var fpos = opts.fiberPositions.get(fiberKey(rec.inputCableId, rec.inputFiberNumber));
                    if (fpos) {
                        var inPt = schemeSplitterPortPos(x, y, box, 'input', 0, ratio, isMirrored, isFlipV, orient);
                        var fexit = fiberSchemeFiberExitPoint(fpos, badgeWCollect, badgeHCollect, nodeRCollect);
                        var inKey = 'in:' + fiberKey(rec.inputCableId, rec.inputFiberNumber) + ':' + rec.id;
                        if (fpos.isTop) {
                            topApproachEntries.push({
                                fiberKey: inKey,
                                fx: fexit.x,
                                px: inPt.x,
                                fy: fexit.y,
                                py: inPt.y
                            });
                        } else {
                            var inSide = {
                                fiberKey: inKey,
                                fx: fexit.x,
                                px: inPt.x,
                                fy: fexit.y,
                                py: inPt.y
                            };
                            if (fpos.isLeft) leftApproachEntries.push(inSide);
                            else rightApproachEntries.push(inSide);
                        }
                    }
                }
                var outs = rec.outputConnections || [];
                var hostUid = typeof global.getObjectUniqueId === 'function' ? global.getObjectUniqueId(hostObj) : null;
                for (var oi = 0; oi < ratio; oi++) {
                    var outLocal = outs[oi];
                    if (!outLocal || !outLocal.cableId || outLocal.fiberNumber == null) continue;
                    if (outLocal.onuId || outLocal.splitterId) continue;
                    if (outLocal.hostId && hostUid && outLocal.hostId !== hostUid) continue;
                    var opos = opts.fiberPositions.get(fiberKey(outLocal.cableId, outLocal.fiberNumber));
                    if (!opos) continue;
                    var outPt = schemeSplitterPortPos(x, y, box, 'output', oi, ratio, isMirrored, isFlipV, orient);
                    var ofexit = fiberSchemeFiberExitPoint(opos, badgeWCollect, badgeHCollect, nodeRCollect);
                    var outKey = 'out:' + fiberKey(outLocal.cableId, outLocal.fiberNumber) + ':' + rec.id + ':' + oi;
                    if (opos.isTop) {
                        topApproachEntries.push({
                            fiberKey: outKey,
                            fx: ofexit.x,
                            px: outPt.x,
                            fy: ofexit.y,
                            py: outPt.y
                        });
                    } else {
                        var outSide = {
                            fiberKey: outKey,
                            fx: ofexit.x,
                            px: outPt.x,
                            fy: ofexit.y,
                            py: outPt.y
                        };
                        if (opos.isLeft) leftApproachEntries.push(outSide);
                        else rightApproachEntries.push(outSide);
                    }
                }
            });
        }
        var topApproachMap = buildTopCableSplitterApproachMap(topApproachEntries);
        var leftApproachMap = buildSideCableSplitterApproachMap(leftApproachEntries, true);
        var rightApproachMap = buildSideCableSplitterApproachMap(rightApproachEntries, false);
        list.forEach(function (rec, idx) {
            var def = defaultPosition(svgW, svgH, idx, list.length);
            var rawX = rec.schemeX != null ? rec.schemeX : def.x;
            var rawY = rec.schemeY != null ? rec.schemeY : def.y;
            var isMirrored = isSchemeMirrored(rec);
            var isFlipV = isSchemeFlipVertical(rec);
            var isVertical = isSchemeVertical(rec);
            var clamped = clampPosition(rawX, rawY, svgW, svgH, rec.splitRatio, getSchemeOrientation(rec));
            var x = clamped.x;
            var y = clamped.y;
            if (rec.schemeX !== x || rec.schemeY !== y) {
                rec.schemeX = x;
                rec.schemeY = y;
            }
            var ratio = parseInt(rec.splitRatio, 10) || DEFAULT_RATIO;
            var box = computeSchemeSplitterBox(ratio, getSchemeOrientation(rec));
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
            var badgeW = isVertical && opts.isEditMode ? 40 : 52;
            var badgeH = 15;
            var badgeY;
            var badgeX;
            var badgeLabel;
            if (isVertical) {
                if (opts.isEditMode) {
                    badgeX = 8;
                    badgeY = Math.max(HEADER_H + 4, h - box.FOOTER_PAD - badgeH - 4);
                    badgeLabel = '1:' + ratio;
                } else {
                    badgeX = w / 2 - badgeW / 2;
                    badgeY = HEADER_H + Math.max(6, (h - HEADER_H - badgeH) / 2);
                    badgeLabel = '1:' + ratio + ' · ' + ratio + ' вых.';
                }
            } else {
                badgeX = w / 2 - badgeW / 2;
                badgeY = HEADER_H + (opts.isEditMode ? 24 : 5);
                badgeLabel = '1:' + ratio + ' · ' + ratio + ' вых.';
            }
            var titleClipId = 'fsp-title-' + String(rec.id).replace(/[^a-zA-Z0-9_-]/g, '');
            var titleClipW = Math.max(40, w - 30);
            var actionBg = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)';
            var actionIcon = isDark ? '#fed7aa' : '#9a3412';
            cardsHtml += '<g class="fiber-scheme-splitter' + (hasIn ? ' fiber-scheme-splitter--connected' : '') + (isMirrored ? ' fiber-scheme-splitter--mirrored' : '') + (isVertical ? ' fiber-scheme-splitter--vertical' : '') + '" data-splitter-id="' + esc(rec.id) + '" data-scheme-mirrored="' + (isMirrored ? '1' : '0') + '" data-scheme-vertical="' + (isVertical ? '1' : '0') + '" transform="translate(' + (x - w / 2) + ',' + (y - h / 2) + ')" filter="url(#fiberSplitterShadow)">';
            cardsHtml += '<title>' + title + ' · 1:' + ratio + (hasIn ? ' · вход ж.' + rec.inputFiberNumber : '') + (isVertical ? ' · верт.' : '') + (isMirrored ? ' · зерк.' : '') + '</title>';
            cardsHtml += '<rect class="fiber-scheme-splitter-body" x="0" y="0" width="' + w + '" height="' + h + '" rx="10" fill="' + bodyFill + '" stroke="' + bodyStroke + '" stroke-width="1.5"/>';
            cardsHtml += '<rect class="fiber-scheme-splitter-header" x="0" y="0" width="' + w + '" height="' + HEADER_H + '" rx="10" fill="url(#splitterHeaderGrad)"/>';
            cardsHtml += '<rect x="0" y="' + (HEADER_H - 6) + '" width="' + w + '" height="6" fill="url(#splitterHeaderGrad)"/>';
            if (isVertical) {
                if (isMirrored) {
                    cardsHtml += '<g stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(9, 6)"><line x1="5" y1="0" x2="5" y2="10"/><line x1="1" y1="7" x2="5" y2="12"/><line x1="9" y1="7" x2="5" y2="12"/></g>';
                } else {
                    cardsHtml += '<g stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(9, 6)"><line x1="5" y1="10" x2="5" y2="0"/><line x1="1" y1="3" x2="5" y2="-2"/><line x1="9" y1="3" x2="5" y2="-2"/></g>';
                }
            } else if (isMirrored) {
                cardsHtml += '<g stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(9, 6)"><line x1="10" y1="5" x2="0" y2="5"/><line x1="3" y1="1" x2="-2" y2="5"/><line x1="3" y1="9" x2="-2" y2="5"/></g>';
            } else {
                cardsHtml += '<g stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(9, 6)"><line x1="0" y1="5" x2="10" y2="5"/><line x1="7" y1="1" x2="12" y2="5"/><line x1="7" y1="9" x2="12" y2="5"/></g>';
            }
            cardsHtml += '<clipPath id="' + titleClipId + '"><rect x="26" y="0" width="' + titleClipW + '" height="' + HEADER_H + '"/></clipPath>';
            cardsHtml += '<text x="28" y="16" clip-path="url(#' + titleClipId + ')" style="font-size:10px;font-weight:600;fill:#fff;pointer-events:none;">' + shortTitle + '</text>';
            if (opts.isEditMode) {
                cardsHtml += '<g class="fiber-scheme-splitter-actions" transform="translate(' + (w - HEADER_ACTIONS_W - 6) + ', ' + (HEADER_H + 4) + ')">';
                cardsHtml += '<rect class="fiber-scheme-splitter-orient-hit" data-splitter-id="' + esc(rec.id) + '" x="0" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"><title>Повернуть (вход сверху / сбоку)</title></rect>';
                cardsHtml += '<text class="fiber-scheme-splitter-orient" data-splitter-id="' + esc(rec.id) + '" x="9" y="13" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">↻</text>';
                cardsHtml += '<rect class="fiber-scheme-splitter-mirror-hit" data-splitter-id="' + esc(rec.id) + '" x="20" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"><title>Отразить зеркально</title></rect>';
                cardsHtml += '<text class="fiber-scheme-splitter-mirror" data-splitter-id="' + esc(rec.id) + '" x="29" y="13" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">⇄</text>';
                cardsHtml += '<rect class="fiber-scheme-splitter-flipv-hit" data-splitter-id="' + esc(rec.id) + '" x="40" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"><title>Перевернуть порядок выходов</title></rect>';
                cardsHtml += '<text class="fiber-scheme-splitter-flipv" data-splitter-id="' + esc(rec.id) + '" x="49" y="13" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">⇅</text>';
                cardsHtml += '<rect class="fiber-scheme-splitter-edit-hit" data-splitter-id="' + esc(rec.id) + '" x="60" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"/>';
                cardsHtml += '<text class="fiber-scheme-splitter-edit" data-splitter-id="' + esc(rec.id) + '" x="69" y="13" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">✎</text>';
                cardsHtml += '<rect class="fiber-scheme-splitter-delete-hit" data-splitter-id="' + esc(rec.id) + '" x="80" y="0" width="18" height="18" rx="4" fill="' + actionBg + '"/>';
                cardsHtml += '<text class="fiber-scheme-splitter-delete" data-splitter-id="' + esc(rec.id) + '" x="89" y="13" text-anchor="middle" style="font-size:11px;fill:' + actionIcon + ';pointer-events:none;">×</text>';
                cardsHtml += '</g>';
            }
            cardsHtml += '<rect x="' + badgeX + '" y="' + badgeY + '" width="' + badgeW + '" height="' + badgeH + '" rx="7.5" fill="' + badgeFill + '"/>';
            cardsHtml += '<text x="' + (badgeX + badgeW / 2) + '" y="' + (badgeY + 10) + '" text-anchor="middle" style="font-size:8px;font-weight:700;fill:' + badgeText + ';pointer-events:none;">' + badgeLabel + '</text>';
            var inPortFill = hasIn ? portActive : portIdle;
            var inPortStroke = hasIn ? portActiveStroke : bodyStroke;
            var inPortClass = 'fiber-scheme-splitter-input-port' + (hasIn ? ' fiber-scheme-splitter-input-port--connected' : '');
            if (opts.isEditMode && opts.wirePickSplitterId === rec.id) inPortClass += ' fiber-scheme-splitter-input-port--pick';
            var inPortPe = opts.isEditMode ? '' : ' pointer-events="none"';
            if (isVertical) {
                var inCx = inputPortLocalX(layout);
                if (!isMirrored) {
                    cardsHtml += '<line x1="' + inCx + '" y1="0" x2="' + inCx + '" y2="-8" stroke="' + inPortStroke + '" stroke-width="2" pointer-events="none"/>';
                    cardsHtml += '<circle class="' + inPortClass + '" data-splitter-id="' + esc(rec.id) + '" cx="' + inCx + '" cy="-8" r="5" fill="' + inPortFill + '" stroke="' + inPortStroke + '" stroke-width="1.5"' + inPortPe + '/>';
                } else {
                    cardsHtml += '<line x1="' + inCx + '" y1="' + h + '" x2="' + inCx + '" y2="' + (h + 8) + '" stroke="' + inPortStroke + '" stroke-width="2" pointer-events="none"/>';
                    cardsHtml += '<circle class="' + inPortClass + '" data-splitter-id="' + esc(rec.id) + '" cx="' + inCx + '" cy="' + (h + 8) + '" r="5" fill="' + inPortFill + '" stroke="' + inPortStroke + '" stroke-width="1.5"' + inPortPe + '/>';
                }
            } else {
                var inCy = inputPortLocalY(layout);
                if (!isMirrored) {
                    cardsHtml += '<line x1="-8" y1="' + inCy + '" x2="0" y2="' + inCy + '" stroke="' + inPortStroke + '" stroke-width="2" pointer-events="none"/>';
                    cardsHtml += '<circle class="' + inPortClass + '" data-splitter-id="' + esc(rec.id) + '" cx="-8" cy="' + inCy + '" r="5" fill="' + inPortFill + '" stroke="' + inPortStroke + '" stroke-width="1.5"' + inPortPe + '/>';
                } else {
                    cardsHtml += '<line x1="' + w + '" y1="' + inCy + '" x2="' + (w + 8) + '" y2="' + inCy + '" stroke="' + inPortStroke + '" stroke-width="2" pointer-events="none"/>';
                    cardsHtml += '<circle class="' + inPortClass + '" data-splitter-id="' + esc(rec.id) + '" cx="' + (w + 8) + '" cy="' + inCy + '" r="5" fill="' + inPortFill + '" stroke="' + inPortStroke + '" stroke-width="1.5"' + inPortPe + '/>';
                }
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
                var portCustomLabel = typeof global.getSplitterOutputLabelFromRec === 'function'
                    ? global.getSplitterOutputLabelFromRec(rec, pi) : '';
                var portTitle = 'Выход ' + (pi + 1) + (portCustomLabel ? ': ' + portCustomLabel : '');
                if (isVertical) {
                    var px = outputPortLocalX(pi, ratio, layout, isFlipV);
                    if (!isMirrored) {
                        cardsHtml += '<line x1="' + px + '" y1="' + h + '" x2="' + px + '" y2="' + (h + 8) + '" stroke="' + portStroke + '" stroke-width="2" pointer-events="none"/>';
                        cardsHtml += '<circle class="' + portClass + '" data-splitter-id="' + esc(rec.id) + '" data-output-index="' + pi + '" cx="' + px + '" cy="' + (h + 8) + '" r="' + box.portR + '" fill="' + portFill + '" stroke="' + portStroke + '" stroke-width="1.5"' + portCursor + portPe + '><title>' + esc(portTitle) + '</title></circle>';
                    } else {
                        cardsHtml += '<line x1="' + px + '" y1="0" x2="' + px + '" y2="-8" stroke="' + portStroke + '" stroke-width="2" pointer-events="none"/>';
                        cardsHtml += '<circle class="' + portClass + '" data-splitter-id="' + esc(rec.id) + '" data-output-index="' + pi + '" cx="' + px + '" cy="-8" r="' + box.portR + '" fill="' + portFill + '" stroke="' + portStroke + '" stroke-width="1.5"' + portCursor + portPe + '><title>' + esc(portTitle) + '</title></circle>';
                    }
                } else {
                    var py = outputPortLocalY(pi, ratio, layout, isFlipV);
                    if (!isMirrored) {
                        cardsHtml += '<line x1="' + w + '" y1="' + py + '" x2="' + (w + 8) + '" y2="' + py + '" stroke="' + portStroke + '" stroke-width="2" pointer-events="none"/>';
                        cardsHtml += '<circle class="' + portClass + '" data-splitter-id="' + esc(rec.id) + '" data-output-index="' + pi + '" cx="' + (w + 8) + '" cy="' + py + '" r="' + box.portR + '" fill="' + portFill + '" stroke="' + portStroke + '" stroke-width="1.5"' + portCursor + portPe + '><title>' + esc(portTitle) + '</title></circle>';
                    } else {
                        cardsHtml += '<line x1="-8" y1="' + py + '" x2="0" y2="' + py + '" stroke="' + portStroke + '" stroke-width="2" pointer-events="none"/>';
                        cardsHtml += '<circle class="' + portClass + '" data-splitter-id="' + esc(rec.id) + '" data-output-index="' + pi + '" cx="-8" cy="' + py + '" r="' + box.portR + '" fill="' + portFill + '" stroke="' + portStroke + '" stroke-width="1.5"' + portCursor + portPe + '><title>' + esc(portTitle) + '</title></circle>';
                    }
                }
            }
            cardsHtml += '</g>';
            var cardAvoidBox = splitterAvoidBox(x, y, box, 8);
            if (opts.fiberPositions && pathOpts.buildConnectionPath) {
                var badgeW = pathOpts.badgeW || 22;
                if (hasIn) {
                    var fkey = fiberKey(rec.inputCableId, rec.inputFiberNumber);
                    var fpos = opts.fiberPositions.get(fkey);
                    if (fpos) {
                        var inPt = schemeSplitterPortPos(x, y, box, 'input', 0, ratio, isMirrored, isFlipV, getSchemeOrientation(rec));
                        var fexit = fiberSchemeFiberExitPoint(fpos, badgeW, pathOpts.badgeH || 16, pathOpts.nodeR || 4);
                        var inRouteMeta = buildRouteMeta(rec.id, 'input', null, inPt.x, x, fpos.isTop ? null : fpos.isLeft);
                        var inApproachKey = 'in:' + fiberKey(rec.inputCableId, rec.inputFiberNumber) + ':' + rec.id;
                        var inCableAy = (fpos.isTop && topApproachMap.has(inApproachKey))
                            ? topApproachMap.get(inApproachKey)
                            : (fpos.isTop ? fexit.y + 22 : null);
                        var inCableAx = null;
                        if (!fpos.isTop) {
                            if (fpos.isLeft) {
                                inCableAx = leftApproachMap.has(inApproachKey)
                                    ? leftApproachMap.get(inApproachKey)
                                    : (fexit.x + 28);
                            } else {
                                inCableAx = rightApproachMap.has(inApproachKey)
                                    ? rightApproachMap.get(inApproachKey)
                                    : (fexit.x - 28);
                            }
                        }
                        var inPathD = buildSplitterLinkPath(
                            fexit.x, fexit.y, inPt.x, inPt.y,
                            {
                                isLeft: fpos.isLeft,
                                isTop: fpos.isTop,
                                fiberPos: fpos,
                                routeSeed: inRouteMeta.routeSeed,
                                routeStagger: inRouteMeta.routeStagger,
                                preferLeft: inRouteMeta.preferLeft,
                                stemStart: inRouteMeta.stemStart,
                                stemEnd: inRouteMeta.stemEnd,
                                laneIndex: inRouteMeta.laneIndex,
                                avoidBox: cardAvoidBox,
                                cableApproachY: inCableAy,
                                cableApproachX: inCableAx
                            },
                            pathOpts, getSchemeOrientation(rec), 'input', isMirrored
                        );
                        var inKey = fiberKey(rec.inputCableId, rec.inputFiberNumber);
                        var inLabel = (splitterConnections[inKey] && splitterConnections[inKey].label) ? splitterConnections[inKey].label : '';
                        linksHtml = appendSplitterLinkHtml(linksHtml, inPathD, rec, 'input', {
                            id: esc(rec.id),
                            label: inLabel,
                            extra: ' data-fiber-exit-x="' + fexit.x + '" data-fiber-exit-y="' + fexit.y + '" data-fiber-is-left="' + (fpos.isLeft ? '1' : '0') + '" data-fiber-is-top="' + (fpos.isTop ? '1' : '0') + '" data-cable-id="' + esc(rec.inputCableId) + '" data-fiber-number="' + rec.inputFiberNumber + '"'
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
                    var outPt = schemeSplitterPortPos(x, y, box, 'output', oi, ratio, isMirrored, isFlipV, getSchemeOrientation(rec));
                    var ox = outPt.x;
                    var oy = outPt.y;
                    var ofexit = fiberSchemeFiberExitPoint(opos, badgeW, pathOpts.badgeH || 16, pathOpts.nodeR || 4);
                    var outRouteMeta = buildRouteMeta(rec.id, 'output', oi, ox, x, opos.isTop ? null : opos.isLeft);
                    var outApproachKey = 'out:' + fiberKey(outLocal.cableId, outLocal.fiberNumber) + ':' + rec.id + ':' + oi;
                    var outCableAy = (opos.isTop && topApproachMap.has(outApproachKey))
                        ? topApproachMap.get(outApproachKey)
                        : (opos.isTop ? ofexit.y + 22 : null);
                    var outCableAx = null;
                    if (!opos.isTop) {
                        if (opos.isLeft) {
                            outCableAx = leftApproachMap.has(outApproachKey)
                                ? leftApproachMap.get(outApproachKey)
                                : (ofexit.x + 28);
                        } else {
                            outCableAx = rightApproachMap.has(outApproachKey)
                                ? rightApproachMap.get(outApproachKey)
                                : (ofexit.x - 28);
                        }
                    }
                    var outPathD = buildSplitterLinkPath(
                        ox, oy, ofexit.x, ofexit.y,
                        {
                            isLeft: opos.isLeft,
                            isTop: opos.isTop,
                            routeSeed: outRouteMeta.routeSeed,
                            routeStagger: outRouteMeta.routeStagger,
                            preferLeft: outRouteMeta.preferLeft,
                            stemStart: outRouteMeta.stemStart,
                            stemEnd: outRouteMeta.stemEnd,
                            laneIndex: outRouteMeta.laneIndex,
                            avoidBox: cardAvoidBox,
                            cableApproachY: outCableAy,
                            cableApproachX: outCableAx
                        },
                        pathOpts, getSchemeOrientation(rec), 'output', isMirrored
                    );
                    var outLabel = typeof global.getSplitterOutputLabelFromRec === 'function'
                        ? global.getSplitterOutputLabelFromRec(rec, oi)
                        : ((outLocal && outLocal.label) ? outLocal.label : '');
                    linksHtml = appendSplitterLinkHtml(linksHtml, outPathD, rec, 'output', {
                        id: esc(rec.id),
                        outputIndex: oi,
                        label: outLabel,
                        extra: ' data-output-index="' + oi + '" data-fiber-exit-x="' + ofexit.x + '" data-fiber-exit-y="' + ofexit.y + '" data-fiber-is-left="' + (opos.isLeft ? '1' : '0') + '" data-fiber-is-top="' + (opos.isTop ? '1' : '0') + '" data-cable-id="' + esc(outLocal.cableId) + '" data-fiber-number="' + outLocal.fiberNumber + '"'
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
                    var tgtBox = computeSchemeSplitterBox(tgtRatio, getSchemeOrientation(tgtRec));
                    var srcPt = schemeSplitterPortPos(x, y, box, 'output', si, ratio, isMirrored, isFlipV, getSchemeOrientation(rec));
                    var tgtPt = schemeSplitterPortPos(tx, ty, tgtBox, 'input', 0, tgtRatio, isSchemeMirrored(tgtRec), isSchemeFlipVertical(tgtRec), getSchemeOrientation(tgtRec));
                    var chainMeta = buildRouteMeta(rec.id, 'chain', si, srcPt.x, x);
                    chainMeta.avoidBox = cardAvoidBox;
                    var spPathD = buildSplitterChainPath(
                        srcPt, tgtPt,
                        getSchemeOrientation(rec),
                        getSchemeOrientation(tgtRec),
                        isMirrored,
                        isSchemeMirrored(tgtRec),
                        withRouteMeta(pathOpts, chainMeta)
                    );
                    var spLabel = typeof global.getSplitterOutputLabelFromRec === 'function'
                        ? global.getSplitterOutputLabelFromRec(rec, si)
                        : ((spOut && spOut.label) ? spOut.label : '');
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
        toggleSchemeOrientation: toggleSchemeOrientation,
        toggleSchemeMirrored: toggleSchemeMirrored,
        toggleSchemeFlipVertical: toggleSchemeFlipVertical,
        isSchemeMirrored: isSchemeMirrored,
        isSchemeFlipVertical: isSchemeFlipVertical,
        isSchemeVertical: isSchemeVertical,
        getSchemeOrientation: getSchemeOrientation,
        fiberSchemeFiberExitPoint: fiberSchemeFiberExitPoint,
        clampPosition: clampPosition,
        getBounds: getBounds,
        getCenterZone: getCenterZone,
        ensureAllInBounds: ensureAllInBounds,
        resetAllPositions: resetAllPositions,
        splitterHeight: splitterHeight,
        computeSplitterLayout: computeSplitterLayout,
        computeSchemeSplitterBox: computeSchemeSplitterBox,
        outputPortLocalY: outputPortLocalY,
        outputPortLocalX: outputPortLocalX,
        inputPortLocalY: inputPortLocalY,
        inputPortLocalX: inputPortLocalX,
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
