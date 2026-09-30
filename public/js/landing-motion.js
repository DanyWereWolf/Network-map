/**
 * Оживление лендинга: появление секций при скролле, лёгкий параллакс карты.
 */
(function() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.body;
    if (!root || !root.classList.contains('landing-page')) return;

    root.classList.add('landing-motion-ready');

    function reveal() {
        var nodes = document.querySelectorAll(
            '.landing-stats, .trust-strip, .landing-block, .landing-cta-band, .landing-footer, .updates-hero, .updates-feed, .legal-hero, .legal-shell, .legal-toc, .legal-section, .legal-cta-band, .legal-delete-layout, .legal-panel'
        );
        if (!nodes.length) return;

        if (reduce || !('IntersectionObserver' in window)) {
            nodes.forEach(function(el) { el.classList.add('is-revealed'); });
            return;
        }

        var io = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-revealed');
                io.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

        nodes.forEach(function(el, i) {
            el.classList.add('landing-reveal');
            el.style.setProperty('--reveal-delay', (Math.min(i, 6) * 0.04) + 's');
            io.observe(el);
        });

        var trustItems = document.querySelectorAll('.trust-item');
        trustItems.forEach(function(el, i) {
            el.style.setProperty('--stagger', (i * 0.06) + 's');
        });

        var caps = document.querySelectorAll('.capability-card');
        caps.forEach(function(el, i) {
            el.style.setProperty('--stagger', (i * 0.07) + 's');
        });
    }

    function parallaxHero() {
        if (reduce) return;
        var map = document.querySelector('.landing-hero-map-svg');
        if (!map) return;
        var ticking = false;
        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function() {
                ticking = false;
                var y = window.scrollY || 0;
                if (y > 700) return;
                map.style.transform = 'translate3d(0,' + (y * 0.08) + 'px,0) scale(1.02)';
            });
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    function animateStats() {
        if (reduce) return;
        var ids = ['heroStatOrgs', 'heroStatUsers', 'heroStatNodes'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            var obs = new MutationObserver(function() {
                if (el.classList.contains('is-loading')) return;
                var text = (el.textContent || '').replace(/\s/g, '');
                var n = parseInt(text, 10);
                if (!isFinite(n) || n <= 0) return;
                obs.disconnect();
                var start = 0;
                var dur = 900;
                var t0 = null;
                function frame(t) {
                    if (!t0) t0 = t;
                    var p = Math.min(1, (t - t0) / dur);
                    var eased = 1 - Math.pow(1 - p, 3);
                    var val = Math.round(start + (n - start) * eased);
                    el.textContent = String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                    if (p < 1) requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
            });
            obs.observe(el, { characterData: true, childList: true, subtree: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            reveal();
            parallaxHero();
            animateStats();
        });
    } else {
        reveal();
        parallaxHero();
        animateStats();
    }
})();
