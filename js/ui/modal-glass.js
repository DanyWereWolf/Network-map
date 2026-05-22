/**
 * Единый стеклянный вид для модальных окон: panel-glass + plexus при открытии.
 */
(function () {
    var LITE_MODAL_IDS = {
        confirmModal: 1,
        userEditModal: 1,
        organizationEditModal: 1,
        updatesModal: 1
    };

    var SHELL_CONTENT_SELECTOR = '.modal-content.node-selection-modal-content';

    function createPanelGlassBg(lite) {
        var bg = document.createElement('div');
        bg.className = 'panel-glass-bg';
        bg.setAttribute('aria-hidden', 'true');
        var gradient = document.createElement('div');
        gradient.className = 'panel-glass-gradient';
        bg.appendChild(gradient);
        if (!lite) {
            var canvas = document.createElement('canvas');
            canvas.className = 'panel-plexus-canvas';
            bg.appendChild(canvas);
        }
        return bg;
    }

    function injectGlassBg(container, lite) {
        if (!container || container.querySelector(':scope > .panel-glass-bg')) return;
        container.insertBefore(createPanelGlassBg(lite), container.firstChild);
        if (!container.classList.contains('panel-glass')) {
            container.classList.add('panel-glass');
        }
    }

    function enhanceNodeSelectionModal(modal) {
        var shell = modal.querySelector(SHELL_CONTENT_SELECTOR);
        if (!shell) return;
        shell.classList.add('panel-glass', 'panel-glass--shell');
        var balloon = shell.querySelector('.node-selection-balloon, .network-map-balloon');
        if (balloon) {
            injectGlassBg(balloon, true);
        }
    }

    function enhanceModal(modal) {
        if (!modal || !modal.classList.contains('modal')) return;
        var modalId = modal.id || '';
        var lite = !!LITE_MODAL_IDS[modalId];

        if (modal.querySelector(SHELL_CONTENT_SELECTOR)) {
            enhanceNodeSelectionModal(modal);
            return;
        }

        if (modalId === 'deviceCatalogModal') {
            var shell = modal.querySelector('.device-catalog-modal-content');
            if (shell) {
                shell.classList.add('panel-glass', 'panel-glass--lite');
                injectGlassBg(shell, true);
            }
            return;
        }

        var content = modal.querySelector(':scope > .modal-content');
        if (!content) return;

        if (modalId === 'helpModal' || content.querySelector(':scope > .panel-glass-bg')) {
            content.classList.add('panel-glass');
            return;
        }

        content.classList.add('panel-glass');
        if (lite) content.classList.add('panel-glass--lite');
        injectGlassBg(content, lite);
    }

    function normalizeModalDisplay(modal) {
        if (!modal || modal.style.display !== 'block') return;
        modal.style.display = 'flex';
        modal.classList.add('modal--centered');
    }

    function refreshModalGlass(modal) {
        if (!modal) return;
        requestAnimationFrame(function () {
            if (typeof window.initPanelPlexusCanvases === 'function') {
                window.initPanelPlexusCanvases(modal);
            }
        });
    }

    function onModalShown(modal) {
        normalizeModalDisplay(modal);
        refreshModalGlass(modal);
    }

    function initAllModals() {
        document.querySelectorAll('.modal').forEach(enhanceModal);
        if (typeof window.initPanelPlexusCanvases === 'function') {
            window.initPanelPlexusCanvases(document);
        }
    }

    function watchModals() {
        if (typeof MutationObserver === 'undefined') return;
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                if (m.attributeName !== 'style') return;
                var modal = m.target;
                if (!modal.classList || !modal.classList.contains('modal')) return;
                var shown = modal.style.display === 'flex' || modal.style.display === 'block';
                if (shown) onModalShown(modal);
            });
        });
        document.querySelectorAll('.modal').forEach(function (modal) {
            observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
        });
    }

    window.enhanceModalGlass = enhanceModal;
    window.refreshModalGlass = refreshModalGlass;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initAllModals();
            watchModals();
        });
    } else {
        initAllModals();
        watchModals();
    }
})();
