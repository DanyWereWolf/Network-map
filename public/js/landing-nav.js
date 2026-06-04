/**
 * Шапка лендинга: если ссылки не помещаются — показываем кнопку «Разделы» и выпадающий список.
 */
(function() {
    var nav = document.getElementById('landingNav');
    var menu = document.getElementById('landingNavMenu');
    var burger = document.getElementById('landingNavBurger');
    var overlay = document.getElementById('landingNavOverlay');
    if (!nav || !menu) return;

    var COLLAPSED_CLASS = 'landing-nav--menu-collapsed';
    var measureScheduled = false;

    function setMenuOpen(open) {
        nav.classList.toggle('is-menu-open', !!open);
        if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
    }

    function menuOverflows() {
        var actions = nav.querySelector('.landing-nav-actions');
        if (!actions) return menu.scrollWidth > menu.clientWidth + 2;

        var menuRect = menu.getBoundingClientRect();
        var actionsRect = actions.getBoundingClientRect();
        if (menuRect.width < 8) return true;
        if (menu.scrollWidth > menu.clientWidth + 2) return true;
        return menuRect.right > actionsRect.left - 6;
    }

    function updateNavMode() {
        var wasCollapsed = nav.classList.contains(COLLAPSED_CLASS);
        if (wasCollapsed) nav.classList.remove(COLLAPSED_CLASS);

        var overflow = menuOverflows();

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
