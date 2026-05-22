/**
 * Анимированный фон «plexus»: полноэкранный (#authPlexusCanvas) или внутри панелей (.panel-plexus-canvas).
 */
(function () {
    var PANEL_OPTS = { nodeCount: 42, maxDist: 130, lineOpacity: 0.14, nodeRadius: 1.4 };
    var MAIN_OPTS = { nodeCount: 80, maxDist: 170 };

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
        var running = true;

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
                        vx: (Math.random() - 0.5) * 0.16,
                        vy: (Math.random() - 0.5) * 0.16
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
                        ctx.strokeStyle = 'rgba(59, 130, 246, ' + op + ')';
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }
            for (i = 0; i < nodes.length; i++) {
                n = nodes[i];
                g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, nodeRadius * 4);
                g.addColorStop(0, 'rgba(147, 197, 253, 0.9)');
                g.addColorStop(0.4, 'rgba(59, 130, 246, 0.4)');
                g.addColorStop(1, 'rgba(59, 130, 246, 0)');
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

        function tick() {
            if (!running) return;
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
            draw();
            requestAnimationFrame(tick);
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
            destroy: function () {
                running = false;
                window.removeEventListener('resize', onResize);
                canvas._plexusResize = null;
                canvas._plexusInstance = null;
            }
        };
        return canvas._plexusInstance;
    }

    window.initPanelPlexusCanvases = function (rootEl) {
        var root = rootEl || document;
        var panels = root.querySelectorAll('.panel-plexus-canvas');
        for (var p = 0; p < panels.length; p++) {
            initPlexus(panels[p], PANEL_OPTS);
        }
    };

    var main = document.getElementById('authPlexusCanvas');
    if (main) {
        initPlexus(main, MAIN_OPTS);
    }

    window.initPanelPlexusCanvases(document);
})();
