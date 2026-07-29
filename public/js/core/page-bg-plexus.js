/**
 * Анимированный фон «plexus»: полноэкранный (#authPlexusCanvas) или внутри панелей (.panel-plexus-canvas).
 * Цвета узлов/линий берутся из --accent-primary (тема / свой акцент).
 */
(function () {
    var PANEL_OPTS = { nodeCount: 42, maxDist: 130, lineOpacity: 0.14, nodeRadius: 1.4 };
    var MAIN_OPTS = { nodeCount: 80, maxDist: 170 };
    var AUTH_OPTS = { nodeCount: 90, maxDist: 185, lineOpacity: 0.15, nodeRadius: 1.7, speed: 0.32 };
    var activeInstances = [];

    function clampByte(n) {
        return Math.max(0, Math.min(255, Math.round(n)));
    }

    function parseCssColorToRgb(value) {
        if (!value || typeof value !== 'string') return null;
        var v = value.trim();
        var hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
            var h = hex[1];
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            return {
                r: parseInt(h.slice(0, 2), 16),
                g: parseInt(h.slice(2, 4), 16),
                b: parseInt(h.slice(4, 6), 16)
            };
        }
        var rgb = v.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
        if (rgb) {
            return {
                r: clampByte(parseFloat(rgb[1])),
                g: clampByte(parseFloat(rgb[2])),
                b: clampByte(parseFloat(rgb[3]))
            };
        }
        return null;
    }

    function mixTowardWhite(rgb, amount) {
        var t = Math.max(0, Math.min(1, amount));
        return {
            r: clampByte(rgb.r + (255 - rgb.r) * t),
            g: clampByte(rgb.g + (255 - rgb.g) * t),
            b: clampByte(rgb.b + (255 - rgb.b) * t)
        };
    }

    function rgba(rgb, alpha) {
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
    }

    function readAccentPalette() {
        var fallback = { r: 59, g: 130, b: 246 };
        var rgb = fallback;
        try {
            var raw = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
            rgb = parseCssColorToRgb(raw) || fallback;
        } catch (e) {}
        var bright = mixTowardWhite(rgb, 0.55);
        return {
            line: rgb,
            glowMid: rgb,
            glowCore: bright
        };
    }

    function initPlexus(canvas, options) {
        if (canvas._plexusResize) {
            canvas._plexusResize();
            return canvas._plexusInstance;
        }

        var ctx = canvas.getContext('2d');
        if (!ctx) return null;

        var opts = options || {};
        var nodes = [];
        var nodeCount = opts.nodeCount || 80;
        var maxDist = opts.maxDist || 170;
        var lineOpacity = opts.lineOpacity != null ? opts.lineOpacity : 0.12;
        var nodeRadius = opts.nodeRadius || 1.6;
        var speed = opts.speed != null ? opts.speed : 0.16;
        var running = true;
        var reducedMotion = false;
        var palette = readAccentPalette();
        try {
            reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (e) {}

        function resize() {
            var parent = canvas.parentElement;
            var w = parent ? parent.clientWidth : window.innerWidth;
            var h = parent ? parent.clientHeight : window.innerHeight;
            if (w < 1 || h < 1) return;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                nodes.length = 0;
            }
            if (nodes.length === 0) {
                for (var i = 0; i < nodeCount; i++) {
                    nodes.push({
                        x: Math.random() * canvas.width,
                        y: Math.random() * canvas.height,
                        vx: (Math.random() - 0.5) * speed,
                        vy: (Math.random() - 0.5) * speed
                    });
                }
            }
        }

        function draw() {
            if (!canvas.width || !canvas.height) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            var i, j, dx, dy, d, op, n, g;
            for (i = 0; i < nodes.length; i++) {
                for (j = i + 1; j < nodes.length; j++) {
                    dx = nodes[j].x - nodes[i].x;
                    dy = nodes[j].y - nodes[i].y;
                    d = Math.sqrt(dx * dx + dy * dy);
                    if (d < maxDist) {
                        op = (1 - d / maxDist) * lineOpacity;
                        ctx.beginPath();
                        ctx.moveTo(nodes[i].x, nodes[i].y);
                        ctx.lineTo(nodes[j].x, nodes[j].y);
                        ctx.strokeStyle = rgba(palette.line, op);
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }
            for (i = 0; i < nodes.length; i++) {
                n = nodes[i];
                g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, nodeRadius * 4);
                g.addColorStop(0, rgba(palette.glowCore, 0.9));
                g.addColorStop(0.4, rgba(palette.glowMid, 0.4));
                g.addColorStop(1, rgba(palette.glowMid, 0));
                ctx.beginPath();
                ctx.arc(n.x, n.y, nodeRadius * 4, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fill();
            }
        }

        function refreshColors() {
            palette = readAccentPalette();
            draw();
        }

        function tick() {
            if (!running) return;
            if (!reducedMotion) {
                var i, n;
                for (i = 0; i < nodes.length; i++) {
                    n = nodes[i];
                    n.x += n.vx;
                    n.y += n.vy;
                    if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
                    if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
                    n.x = Math.max(0, Math.min(canvas.width, n.x));
                    n.y = Math.max(0, Math.min(canvas.height, n.y));
                }
            }
            draw();
            if (!reducedMotion) requestAnimationFrame(tick);
        }

        resize();
        tick();

        var onResize = function () {
            resize();
            draw();
        };
        window.addEventListener('resize', onResize);

        if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
            var ro = new ResizeObserver(onResize);
            ro.observe(canvas.parentElement);
        }

        canvas._plexusResize = onResize;
        canvas._plexusInstance = {
            refreshColors: refreshColors,
            setEnabled: function (enabled) {
                if (enabled) {
                    if (!running) {
                        running = true;
                        tick();
                    }
                } else {
                    running = false;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            },
            destroy: function () {
                running = false;
                window.removeEventListener('resize', onResize);
                var idx = activeInstances.indexOf(canvas._plexusInstance);
                if (idx !== -1) activeInstances.splice(idx, 1);
                canvas._plexusResize = null;
                canvas._plexusInstance = null;
            }
        };
        activeInstances.push(canvas._plexusInstance);
        if (typeof window.isPlexusEnabled === 'function' && !window.isPlexusEnabled()) {
            canvas._plexusInstance.setEnabled(false);
        }
        return canvas._plexusInstance;
    }

    window.refreshPlexusAccentColors = function () {
        for (var i = 0; i < activeInstances.length; i++) {
            if (activeInstances[i] && typeof activeInstances[i].refreshColors === 'function') {
                activeInstances[i].refreshColors();
            }
        }
    };

    window.setPlexusEnabled = function (enabled) {
        enabled = !!enabled;
        document.documentElement.classList.toggle('perf-plexus-off', !enabled);
        for (var i = 0; i < activeInstances.length; i++) {
            if (activeInstances[i] && typeof activeInstances[i].setEnabled === 'function') {
                activeInstances[i].setEnabled(enabled);
            }
        }
    };

    window.initPanelPlexusCanvases = function (rootEl) {
        var root = rootEl || document;
        var panels = root.querySelectorAll('.panel-plexus-canvas');
        for (var p = 0; p < panels.length; p++) {
            initPlexus(panels[p], PANEL_OPTS);
        }
    };

    var main = document.getElementById('authPlexusCanvas');
    if (main) {
        var isAuthPage = document.body && document.body.classList.contains('auth-page');
        initPlexus(main, isAuthPage ? AUTH_OPTS : MAIN_OPTS);
    }

    window.initPanelPlexusCanvases(document);
})();
