/**
 * Шапка лендинга: если ссылки не помещаются — кнопка «Разделы» и выпадающий список.
 * На широкой оболочке меню всегда в строке (не прячем в «Разделы»).
 */
(function() {
    var nav = document.getElementById('landingNav');
    var menu = document.getElementById('landingNavMenu');
    var burger = document.getElementById('landingNavBurger');
    var overlay = document.getElementById('landingNavOverlay');
    if (!nav || !menu) return;

    var COLLAPSED_CLASS = 'landing-nav--menu-collapsed';
    var WIDE_INLINE_MIN = 1100;
    var measureScheduled = false;

    function setMenuOpen(open) {
        nav.classList.toggle('is-menu-open', !!open);
        if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
    }

    function shellWidth() {
        var shell = nav.closest('.landing-shell') || nav.closest('.landing-root') || nav;
        return shell.clientWidth || window.innerWidth || 0;
    }

    function linksNaturalWidth() {
        var total = 0;
        var links = menu.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            total += links[i].scrollWidth;
        }
        // gap между пунктами (~8px) + внутренние отступы меню
        total += Math.max(0, links.length - 1) * 8 + 16;
        return total;
    }

    function menuOverflows() {
        var left = nav.querySelector('.landing-nav-left');
        var actions = nav.querySelector('.landing-nav-actions');
        var navPad = 8;
        var available = nav.clientWidth
            - (left ? left.offsetWidth : 0)
            - (actions ? actions.offsetWidth : 0)
            - navPad * 2
            - 20;
        if (available < 160) return true;
        return linksNaturalWidth() > available + 4;
    }

    function updateNavMode() {
        var wide = shellWidth() >= WIDE_INLINE_MIN;
        var wasCollapsed = nav.classList.contains(COLLAPSED_CLASS);

        // Для замера ссылок нужны в строке
        if (wasCollapsed) nav.classList.remove(COLLAPSED_CLASS);

        var overflow = wide ? false : menuOverflows();

        if (overflow) {
            nav.classList.add(COLLAPSED_CLASS);
        } else {
            nav.classList.remove(COLLAPSED_CLASS);
            setMenuOpen(false);
        }
    }

    function scheduleMeasure() {
        if (measureScheduled) return;
        measureScheduled = true;
        requestAnimationFrame(function() {
            measureScheduled = false;
            updateNavMode();
        });
    }

    if (burger) {
        burger.addEventListener('click', function() {
            if (!nav.classList.contains(COLLAPSED_CLASS)) return;
            setMenuOpen(!nav.classList.contains('is-menu-open'));
        });
    }
    if (overlay) {
        overlay.addEventListener('click', function() { setMenuOpen(false); });
    }
    menu.querySelectorAll('a').forEach(function(a) {
        a.addEventListener('click', function() { setMenuOpen(false); });
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') setMenuOpen(false);
    });

    if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(scheduleMeasure);
        ro.observe(nav);
        ro.observe(menu);
        var shell = nav.closest('.landing-shell');
        if (shell) ro.observe(shell);
    }
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('load', scheduleMeasure);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleMeasure);
    }
    scheduleMeasure();
})();
