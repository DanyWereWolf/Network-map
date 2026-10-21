/**
 * Приветственное окно и интерактивный тур по интерфейсу.
 */
var WELCOME_DISMISSED_KEY = 'networkMap_welcomeDismissed';
var ONBOARDING_COMPLETED_KEY = 'networkMap_onboardingCompleted';
var ONBOARDING_PROGRESS_KEY = 'networkMap_onboardingProgress';
var ONBOARDING_VERSION = 4;
var onboardingState = null;

function getWelcomeDismissedKeyForCurrentUser() {
    var suffix = 'guest';
    if (currentUser) {
        if (currentUser.userId != null && String(currentUser.userId).trim() !== '') {
            suffix = String(currentUser.userId).trim();
        } else if (currentUser.username) {
            suffix = String(currentUser.username).trim().toLowerCase();
        }
    }
    return WELCOME_DISMISSED_KEY + '_' + suffix;
}

function getOnboardingCompletedKeyForCurrentUser() {
    var suffix = 'guest';
    if (currentUser) {
        if (currentUser.userId != null && String(currentUser.userId).trim() !== '') {
            suffix = String(currentUser.userId).trim();
        } else if (currentUser.username) {
            suffix = String(currentUser.username).trim().toLowerCase();
        }
    }
    return ONBOARDING_COMPLETED_KEY + '_' + suffix;
}

function getOnboardingProgressKeyForCurrentUser() {
    var suffix = 'guest';
    if (currentUser) {
        if (currentUser.userId != null && String(currentUser.userId).trim() !== '') {
            suffix = String(currentUser.userId).trim();
        } else if (currentUser.username) {
            suffix = String(currentUser.username).trim().toLowerCase();
        }
    }
    return ONBOARDING_PROGRESS_KEY + '_' + suffix;
}

function markOnboardingCompleted() {
    try { localStorage.setItem(getOnboardingCompletedKeyForCurrentUser(), '1'); } catch (e) {}
    clearOnboardingProgress();
}

function clearOnboardingCompletedFlag() {
    try { localStorage.removeItem(getOnboardingCompletedKeyForCurrentUser()); } catch (e) {}
}

function hasOnboardingCompleted() {
    try { return !!localStorage.getItem(getOnboardingCompletedKeyForCurrentUser()); } catch (e) { return false; }
}

function saveOnboardingProgress(index) {
    try {
        localStorage.setItem(getOnboardingProgressKeyForCurrentUser(), JSON.stringify({
            index: Math.max(0, Number(index) || 0),
            version: ONBOARDING_VERSION,
            ts: Date.now()
        }));
    } catch (e) {}
}

function getSavedOnboardingProgressIndex(totalSteps) {
    try {
        var raw = localStorage.getItem(getOnboardingProgressKeyForCurrentUser());
        if (!raw) return null;
        var data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (Number(data.version) !== ONBOARDING_VERSION) return null;
        var idx = Number(data.index);
        if (!Number.isFinite(idx)) return null;
        idx = Math.floor(idx);
        if (idx < 0) idx = 0;
        if (typeof totalSteps === 'number' && totalSteps > 0 && idx > totalSteps - 1) idx = totalSteps - 1;
        return idx;
    } catch (e) {
        return null;
    }
}

function clearOnboardingProgress() {
    try { localStorage.removeItem(getOnboardingProgressKeyForCurrentUser()); } catch (e) {}
}

function isOnboardingEditStepsAllowed() {
    if (typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly()) return false;
    if (currentUser && currentUser.role !== 'admin') return false;
    var editBtn = document.getElementById('editMode');
    return !!(editBtn && editBtn.style.display !== 'none');
}

function fitMapForOnboarding() {
    if (typeof myMap !== 'undefined' && myMap && myMap.container) {
        setTimeout(function() {
            try { myMap.container.fitToViewport(); } catch (e) {}
        }, 300);
    }
}

function ensureInfoDockVisibleForOnboarding() {
    if (!document.body.classList.contains('info-dock-collapsed')) return;
    document.body.classList.remove('info-dock-collapsed');
    var toggleBtn = document.getElementById('infoDockToggle');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.setAttribute('aria-label', 'Скрыть панель карты');
        toggleBtn.setAttribute('title', 'Скрыть панель');
    }
    try { localStorage.setItem('infoDockCollapsed', '0'); } catch (e) {}
    fitMapForOnboarding();
}

function openOnboardingInfoDockSection(sectionId) {
    ensureInfoDockVisibleForOnboarding();
    var section = document.getElementById(sectionId);
    if (!section) return;
    section.open = true;
}

function ensurePropertiesPanelVisibleForOnboarding(which, opts) {
    document.body.classList.remove('sidebar-collapsed');
    if (typeof openToolProps === 'function') {
        openToolProps(which || 'object', opts || { activateMap: false });
    } else {
        document.body.classList.add('properties-open');
        var panel = document.getElementById('sidebar');
        if (panel) {
            panel.classList.add('is-filled');
            panel.classList.remove('properties-panel--empty');
        }
    }
    fitMapForOnboarding();
}

function closeHistoryModalIfOpen() {
    var modal = document.getElementById('historyModal');
    if (!modal) return;
    if (modal.style.display === 'block' || modal.style.display === 'flex') {
        modal.style.display = 'none';
    }
}

function getOnboardingSteps() {
    var steps = [
        {
            title: 'Добро пожаловать!',
            text: 'Это карта вашей организации: узлы, кабели, кроссы, муфты и GPON. Сейчас коротко покажем новый интерфейс.',
            hint: 'Примерное время — около 3 минут. Можно прервать и продолжить позже.'
        },
        {
            selector: '#infoDock',
            title: 'Панель карты',
            text: 'Слева — режим работы, видимость типов, вид карты, настройки и легенда.',
            hint: 'Свернуть панель можно закладкой на левом краю экрана.',
            prepare: ensureInfoDockVisibleForOnboarding,
            preferredPlacement: 'right'
        },
        {
            selector: '#mapSearch',
            title: 'Поиск объектов',
            text: 'Введите название — список подскажет совпадения и перенесёт карту к нужному объекту.',
            hint: 'Поиск работает по названиям узлов, кроссов, муфт, OLT и других объектов.',
            disableAutoScroll: true
        },
        {
            selector: '#map',
            title: 'Навигация по карте',
            text: 'Колёсико — масштаб, перетаскивание — сдвиг. Клик по объекту откроет карточку; по кроссу или муфте — рабочее место волокон.',
            preferredPlacement: 'left'
        }
    ];

    if (isOnboardingEditStepsAllowed()) {
        steps.push(
            {
                selector: '.mode-switcher',
                title: 'Режим редактирования',
                text: 'В левой панели включите «Редактирование» — сверху появится панель инструментов.',
                requireAction: true,
                prepare: ensureInfoDockVisibleForOnboarding,
                preferredPlacement: 'right',
                isComplete: function() {
                    if (typeof isEditMode !== 'undefined' && isEditMode) return true;
                    var editBtn = document.getElementById('editMode');
                    return !!(editBtn && editBtn.classList.contains('active'));
                }
            },
            {
                selector: '#editToolbar',
                title: 'Инструменты',
                text: 'Сверху — типы объектов, кабель и зоны. Выберите тип (например, опору) — справа откроются параметры.',
                requireAction: true,
                preferredPlacement: 'bottom',
                disableAutoScroll: true,
                isComplete: function(step) {
                    return !!step._interacted;
                },
                setup: function(step) {
                    var strip = document.getElementById('editToolsStrip');
                    step._interacted = false;
                    if (!strip) return null;
                    var onClick = function(e) {
                        var chip = e.target && e.target.closest
                            ? e.target.closest('.edit-tool-chip[data-edit-tool="object"], .object-type-chip[data-type]')
                            : null;
                        if (chip && strip.contains(chip)) step._interacted = true;
                    };
                    strip.addEventListener('click', onClick);
                    return function() {
                        strip.removeEventListener('click', onClick);
                    };
                }
            },
            {
                selector: '#sidebar',
                title: 'Параметры инструмента',
                text: 'Справа — имя и настройки выбранного типа. Для большинства объектов размещение уже активно.',
                hint: 'У узла и кросса сначала введите имя, затем кликните по карте.',
                preferredPlacement: 'left',
                prepare: function() {
                    ensurePropertiesPanelVisibleForOnboarding('object', { activateMap: true });
                }
            },
            {
                selector: '#map',
                title: 'Размещение объекта',
                text: 'Кликните по карте в нужном месте — объект появится и сохранится для команды.',
                requireAction: true,
                preferredPlacement: 'left',
                prepare: function() {
                    ensurePropertiesPanelVisibleForOnboarding('object', { activateMap: true });
                },
                setup: function(step) {
                    step._objectsCountBefore = Array.isArray(objects) ? objects.length : 0;
                    step._mapLimitCountBefore = (typeof mapLimitsCache === 'object' && mapLimitsCache && mapLimitsCache.count != null)
                        ? Number(mapLimitsCache.count) : 0;
                },
                isComplete: function(step) {
                    var currentCount = Array.isArray(objects) ? objects.length : 0;
                    var mapLimitCountNow = (typeof mapLimitsCache === 'object' && mapLimitsCache && mapLimitsCache.count != null)
                        ? Number(mapLimitsCache.count) : 0;
                    return currentCount > (step._objectsCountBefore || 0)
                        || mapLimitCountNow > (step._mapLimitCountBefore || 0);
                }
            },
            {
                selector: '.edit-tool-chip--cable',
                title: 'Прокладка кабелей',
                text: 'Инструмент «Кабель» открывает параметры справа. Кликайте по опорам и колодцам, чтобы проложить ВОЛС.',
                hint: 'Медные линии — из карточки узла, медиаконвертера или радиомоста.',
                preferredPlacement: 'bottom',
                disableAutoScroll: true,
                prepare: function() {
                    ensurePropertiesPanelVisibleForOnboarding('cable', { activateMap: false });
                }
            }
        );
    } else {
        steps.push({
            selector: '#viewMode',
            title: 'Режим просмотра',
            text: 'Вы в режиме просмотра: карту можно изучать и трассировать. Изменения доступны администраторам организации.',
            prepare: ensureInfoDockVisibleForOnboarding,
            preferredPlacement: 'right'
        });
    }

    steps.push(
        {
            selector: '#mapFilterBadge',
            title: 'Видимость объектов',
            text: 'В разделе «Видимость» скройте лишние типы, чтобы не перегружать карту. При отдалении мелкие подписи скрываются.',
            prepare: function() {
                openOnboardingInfoDockSection('infoDockMapSection');
            },
            preferredPlacement: 'right'
        },
        {
            selector: '#undoBtn',
            title: 'Отмена и повтор',
            text: 'Кнопки в шапке отменяют и возвращают последние правки (до 20 шагов). Горячие клавиши: Ctrl+Z и Ctrl+Y.',
            disableAutoScroll: true
        },
        {
            selector: '#orgChatBtn',
            title: 'Чат команды',
            text: 'Общайтесь с коллегами организации: сообщения, файлы и упоминания @имени. Изменения на карте синхронизируются автоматически.',
            disableAutoScroll: true
        },
        {
            selector: '#themeToggle',
            title: 'Смена темы',
            text: 'Переключайте светлую и тёмную тему — выбор сохраняется в вашем профиле.',
            hint: 'Удобно работать вечером в тёмной теме и днём — в светлой.',
            disableAutoScroll: true
        },
        {
            selector: '#historyBtn',
            title: 'Журнал изменений',
            text: 'Откройте журнал — здесь видны все правки с фильтрами по пользователю и дате. На кнопке — число непросмотренных записей.',
            requireAction: true,
            disableAutoScroll: true,
            isComplete: function() {
                var modal = document.getElementById('historyModal');
                if (!modal) return false;
                return modal.style.display === 'block' || modal.style.display === 'flex';
            },
            teardown: closeHistoryModalIfOpen
        },
        {
            selector: '#userAvatar',
            title: 'Личный кабинет',
            text: 'Через аватар — профиль, лимиты организации и настройки учётной записи.',
            disableAutoScroll: true
        },
        {
            selector: '#infoHelpBtn',
            title: 'Полная справка',
            text: 'Подробные инструкции по кроссам, муфтам, GPON и совместной работе — в справке. Обучение можно пройти снова оттуда.',
            disableAutoScroll: true
        }
    );

    return steps;
}

function isOnboardingAllowedForCurrentDevice() {
    try {
        var isNarrow = typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly();
        var isTouchLike = false;
        if (typeof window.matchMedia === 'function') {
            isTouchLike = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
        }
        // Отключаем обучение только для сценария «похоже на телефон»:
        // узкий экран + touch-управление.
        return !(isNarrow && isTouchLike);
    } catch (e) {
        return true;
    }
}

function clearOnboardingHighlight() {
    if (onboardingState && onboardingState.activeTarget) {
        onboardingState.activeTarget.classList.remove('onboarding-highlight');
    }
    updateOnboardingSpotlight(null);
}

function resolveOnboardingStepTarget(step) {
    if (!step || !step.selector) return null;
    try {
        return document.querySelector(step.selector);
    } catch (e) {
        return null;
    }
}

function refreshOnboardingTargetHighlight(step) {
    if (!onboardingState || onboardingState.completing) return null;
    var target = resolveOnboardingStepTarget(step);
    if (onboardingState.activeTarget && onboardingState.activeTarget !== target) {
        onboardingState.activeTarget.classList.remove('onboarding-highlight');
    }
    onboardingState.activeTarget = target || null;
    if (target) target.classList.add('onboarding-highlight');
    return target;
}

function repositionOnboardingUi() {
    if (!onboardingState || onboardingState.completing) return;
    var step = onboardingState.steps[onboardingState.index];
    if (!step) return;
    var target = refreshOnboardingTargetHighlight(step);
    positionOnboardingCard(onboardingState.card, target, step);
}

function scheduleOnboardingReposition() {
    if (!onboardingState || onboardingState.completing) return;
    if (onboardingState._repositionTimers) {
        onboardingState._repositionTimers.forEach(function(id) {
            clearTimeout(id);
        });
    }
    onboardingState._repositionTimers = [];

    var run = function() {
        repositionOnboardingUi();
    };

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            run();
            requestAnimationFrame(run);
        });
    } else {
        run();
    }

    // Панель инструментов / props сдвигают layout после click — догоняем после reflow.
    [50, 120, 280, 450].forEach(function(ms) {
        onboardingState._repositionTimers.push(setTimeout(run, ms));
    });
}

function updateOnboardingSpotlight(target) {
    if (!onboardingState || !onboardingState.spotlightEl) return;
    var spot = onboardingState.spotlightEl;
    if (!target) {
        spot.style.display = 'none';
        spot.removeAttribute('aria-hidden');
        return;
    }
    var rect;
    try {
        var s = window.getComputedStyle(target);
        rect = target.getBoundingClientRect();
        if (s.display === 'none' || s.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
            spot.style.display = 'none';
            return;
        }
    } catch (e) {
        spot.style.display = 'none';
        return;
    }
    var pad = 8;
    spot.style.display = 'block';
    spot.style.left = String(Math.round(rect.left - pad)) + 'px';
    spot.style.top = String(Math.round(rect.top - pad)) + 'px';
    spot.style.width = String(Math.round(rect.width + pad * 2)) + 'px';
    spot.style.height = String(Math.round(rect.height + pad * 2)) + 'px';
}

function removeOnboardingSpotlightEl() {
    if (onboardingState && onboardingState.spotlightEl && onboardingState.spotlightEl.parentNode) {
        onboardingState.spotlightEl.parentNode.removeChild(onboardingState.spotlightEl);
    }
}

function stopOnboardingTour(markCompleted) {
    if (!onboardingState) return;
    if (onboardingState._repositionTimers) {
        onboardingState._repositionTimers.forEach(function(id) {
            clearTimeout(id);
        });
        onboardingState._repositionTimers = null;
    }
    if (typeof onboardingState.stepCleanup === 'function') {
        try { onboardingState.stepCleanup(); } catch (e) {}
    }
    var currentStep = onboardingState.steps[onboardingState.index];
    if (currentStep && typeof currentStep.teardown === 'function') {
        try { currentStep.teardown(currentStep); } catch (e) {}
    }
    if (typeof onboardingState.detachProgressSignals === 'function') {
        onboardingState.detachProgressSignals();
    }
    clearOnboardingHighlight();
    window.removeEventListener('resize', onboardingState.reposition, true);
    window.removeEventListener('scroll', onboardingState.reposition, true);
    if (typeof onboardingState.detachKeyboard === 'function') {
        onboardingState.detachKeyboard();
    }
    removeOnboardingSpotlightEl();
    if (onboardingState.overlay && onboardingState.overlay.parentNode) {
        onboardingState.overlay.parentNode.removeChild(onboardingState.overlay);
    }
    onboardingState = null;
    if (markCompleted) markOnboardingCompleted();
}

function positionOnboardingCard(card, target, step) {
    if (!card) return;
    var margin = 12;
    var isTargetVisible = false;
    if (target) {
        try {
            var s = window.getComputedStyle(target);
            var r = target.getBoundingClientRect();
            isTargetVisible = s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        } catch (e) {
            isTargetVisible = false;
        }
    }
    if (!target || !isTargetVisible) {
        card.style.left = '50%';
        card.style.top = '50%';
        card.style.transform = 'translate(-50%, -50%)';
        card.setAttribute('data-placement', 'center');
        updateOnboardingSpotlight(null);
        return;
    }
    var rect = target.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var preferredPlacement = step && step.preferredPlacement ? step.preferredPlacement : 'bottom';
    var placements = [preferredPlacement, 'bottom', 'top', 'right', 'left'];
    var seen = {};
    var normalized = [];
    for (var i = 0; i < placements.length; i++) {
        var p = placements[i];
        if (seen[p]) continue;
        seen[p] = true;
        normalized.push(p);
    }

    function clampPosition(pos) {
        var clamped = { left: pos.left, top: pos.top };
        if (clamped.top < margin) clamped.top = margin;
        if (clamped.left < margin) clamped.left = margin;
        if (clamped.left + cardRect.width > window.innerWidth - margin) {
            clamped.left = window.innerWidth - cardRect.width - margin;
        }
        if (clamped.top + cardRect.height > window.innerHeight - margin) {
            clamped.top = window.innerHeight - cardRect.height - margin;
        }
        return clamped;
    }

    function getPosByPlacement(place) {
        if (place === 'right') return { left: rect.right + margin, top: rect.top };
        if (place === 'left') return { left: rect.left - cardRect.width - margin, top: rect.top };
        if (place === 'top') return { left: rect.left, top: rect.top - cardRect.height - margin };
        return { left: rect.left, top: rect.bottom + margin };
    }

    function intersectsTarget(pos) {
        var cardLeft = pos.left;
        var cardTop = pos.top;
        var cardRight = cardLeft + cardRect.width;
        var cardBottom = cardTop + cardRect.height;
        return !(cardRight <= rect.left || cardLeft >= rect.right || cardBottom <= rect.top || cardTop >= rect.bottom);
    }

    var selected = null;
    var selectedPlacement = 'bottom';
    for (var j = 0; j < normalized.length; j++) {
        var candidate = clampPosition(getPosByPlacement(normalized[j]));
        if (!intersectsTarget(candidate)) {
            selected = candidate;
            selectedPlacement = normalized[j];
            break;
        }
    }
    if (!selected) {
        selectedPlacement = 'top';
        selected = { left: window.innerWidth - cardRect.width - margin, top: margin };
        selected = clampPosition(selected);
    }

    card.style.left = String(Math.round(selected.left)) + 'px';
    card.style.top = String(Math.round(selected.top)) + 'px';
    card.style.transform = 'none';
    card.setAttribute('data-placement', selectedPlacement);
    updateOnboardingSpotlight(target);
}

function renderOnboardingStep() {
    if (!onboardingState) return;
    var step = onboardingState.steps[onboardingState.index];
    if (!step) return;

    if (typeof onboardingState.stepCleanup === 'function') {
        try { onboardingState.stepCleanup(); } catch (e) {}
        onboardingState.stepCleanup = null;
    }
    var prevStep = onboardingState.previousStep;
    if (prevStep && prevStep !== step && typeof prevStep.teardown === 'function') {
        try { prevStep.teardown(prevStep); } catch (e) {}
    }
    onboardingState.previousStep = step;

    clearOnboardingHighlight();

    if (typeof step.prepare === 'function') {
        try { step.prepare(step); } catch (e) {}
    }

    var target = refreshOnboardingTargetHighlight(step);

    if (target && typeof target.scrollIntoView === 'function' && !step.disableAutoScroll) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }

    var stepNum = onboardingState.index + 1;
    var stepTotal = onboardingState.steps.length;
    onboardingState.stepEl.textContent = String(stepNum) + ' / ' + String(stepTotal);
    onboardingState.titleEl.textContent = step.title;
    onboardingState.textEl.textContent = step.text;

    if (onboardingState.hintEl) {
        if (step.hint) {
            onboardingState.hintEl.textContent = step.hint;
            onboardingState.hintEl.hidden = false;
        } else {
            onboardingState.hintEl.textContent = '';
            onboardingState.hintEl.hidden = true;
        }
    }

    if (onboardingState.progressFill) {
        var pct = stepTotal > 1 ? Math.round((stepNum / stepTotal) * 100) : 100;
        onboardingState.progressFill.style.width = String(pct) + '%';
        if (onboardingState.progressBar) {
            onboardingState.progressBar.setAttribute('aria-valuenow', String(stepNum));
            onboardingState.progressBar.setAttribute('aria-valuemax', String(stepTotal));
        }
    }

    onboardingState.prevBtn.disabled = onboardingState.index === 0;
    onboardingState.nextBtn.textContent = onboardingState.index === onboardingState.steps.length - 1 ? 'Завершить' : 'Далее';
    onboardingState.statusEl.textContent = step.requireAction ? 'Ожидание действия…' : 'Можно нажать «Далее»';
    onboardingState.statusEl.classList.remove('onboarding-status--done');
    if (onboardingState.avatarEl) {
        var stepEmotion = step.requireAction ? 'think' : (step.hint ? 'question' : 'cheer');
        if (window.AssistantAvatars) {
            AssistantAvatars.applyTo(onboardingState.avatarEl, stepEmotion);
        } else {
            onboardingState.avatarEl.src = 'icons/assistant/vola-' + stepEmotion + '.png';
        }
    }

    if (typeof step.setup === 'function') {
        try {
            var cleanup = step.setup(step);
            if (typeof cleanup === 'function') onboardingState.stepCleanup = cleanup;
        } catch (e) {}
    }

    if (step.requireAction) {
        onboardingState.nextBtn.disabled = true;
    } else {
        onboardingState.nextBtn.disabled = false;
    }

    saveOnboardingProgress(onboardingState.index);
    evaluateOnboardingStepCompletion();

    positionOnboardingCard(onboardingState.card, target, step);
    scheduleOnboardingReposition();
}

function evaluateOnboardingStepCompletion() {
    if (!onboardingState) return;
    var step = onboardingState.steps[onboardingState.index];
    if (!step || !step.requireAction) return;
    var done = false;
    try {
        done = typeof step.isComplete === 'function' ? !!step.isComplete(step) : false;
    } catch (e) {
        done = false;
    }
    if (done && !step._completed) {
        step._completed = true;
        if (typeof step.onCompleted === 'function') {
            try { step.onCompleted(step); } catch (e) {}
        }
    }
    onboardingState.nextBtn.disabled = !done;
    onboardingState.statusEl.classList.toggle('onboarding-status--done', done);
    onboardingState.statusEl.textContent = done ? '✓ Готово — нажмите «Далее»' : 'Ожидание действия…';
    if (onboardingState.avatarEl) {
        var emotion = done ? 'thumbs' : 'think';
        if (window.AssistantAvatars) {
            AssistantAvatars.applyTo(onboardingState.avatarEl, emotion);
        } else {
            onboardingState.avatarEl.src = 'icons/assistant/vola-' + emotion + '.png';
        }
    }
}

function showOnboardingCompletionAndFinish() {
    if (!onboardingState) return;
    if (typeof onboardingState.stepCleanup === 'function') {
        try { onboardingState.stepCleanup(); } catch (e) {}
        onboardingState.stepCleanup = null;
    }
    clearOnboardingHighlight();
    if (onboardingState.spotlightEl) onboardingState.spotlightEl.style.display = 'none';
    if (onboardingState.actionsEl) onboardingState.actionsEl.style.display = 'none';
    if (onboardingState.metaEl) onboardingState.metaEl.hidden = true;
    if (onboardingState.hintEl) onboardingState.hintEl.hidden = true;
    if (onboardingState.progressFill) onboardingState.progressFill.style.width = '100%';
    onboardingState.card.classList.add('onboarding-card--complete');
    onboardingState.card.setAttribute('data-placement', 'center');
    onboardingState.card.style.left = '50%';
    onboardingState.card.style.top = '50%';
    onboardingState.card.style.transform = 'translate(-50%, -50%)';
    if (onboardingState.avatarEl) {
        if (window.AssistantAvatars) {
            AssistantAvatars.applyTo(onboardingState.avatarEl, 'sparkle');
        } else {
            onboardingState.avatarEl.src = 'icons/assistant/vola-sparkle.png';
        }
    }
    onboardingState.stepEl.textContent = '';
    onboardingState.titleEl.textContent = 'Отлично!';
    onboardingState.textEl.textContent = 'Вы прошли основы работы с картой. Подробные инструкции — в справке в шапке, обучение можно повторить оттуда же.';
    onboardingState.statusEl.classList.add('onboarding-status--done');
    onboardingState.statusEl.textContent = 'Приятной работы!';
    markOnboardingCompleted();
    clearOnboardingProgress();
    if (typeof showInfo === 'function') {
        showInfo('Обучение завершено. Справка — в шапке карты.', 'Volsmap');
    }
    setTimeout(function() {
        stopOnboardingTour(false);
    }, 3200);
}

function startOnboardingTour(options) {
    options = options || {};
    if (!isOnboardingAllowedForCurrentDevice()) return;
    if (!options.force && hasOnboardingCompleted()) return;
    if (onboardingState) return;

    var steps = getOnboardingSteps();
    if (!steps || !steps.length) return;
    var resumeIndex = options.resumeFromSaved ? getSavedOnboardingProgressIndex(steps.length) : null;

    var overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Интерактивное обучение');

    var card = document.createElement('div');
    card.className = 'onboarding-card panel-glass';

    var cardBg = document.createElement('div');
    cardBg.className = 'panel-glass-bg';
    cardBg.setAttribute('aria-hidden', 'true');
    var cardGradient = document.createElement('div');
    cardGradient.className = 'panel-glass-gradient';
    var cardCanvas = document.createElement('canvas');
    cardCanvas.className = 'panel-plexus-canvas';
    cardBg.appendChild(cardGradient);
    cardBg.appendChild(cardCanvas);

    var hero = document.createElement('div');
    hero.className = 'onboarding-hero';
    var avatarStage = document.createElement('div');
    avatarStage.className = 'onboarding-avatar-stage';
    var avatarGlow = document.createElement('span');
    avatarGlow.className = 'onboarding-avatar-glow';
    avatarGlow.setAttribute('aria-hidden', 'true');
    var avatar = document.createElement('img');
    avatar.className = 'onboarding-avatar';
    avatar.src = window.AssistantAvatars
        ? AssistantAvatars.getSrc('cheer')
        : 'icons/assistant/vola-cheer.png';
    avatar.alt = 'Вола';
    avatar.decoding = 'async';
    avatarStage.appendChild(avatarGlow);
    avatarStage.appendChild(avatar);
    var heroLabel = document.createElement('p');
    heroLabel.className = 'onboarding-hero-label';
    heroLabel.textContent = 'Вола · обучение';
    hero.appendChild(avatarStage);
    hero.appendChild(heroLabel);

    var meta = document.createElement('div');
    meta.className = 'onboarding-meta';
    var stepEl = document.createElement('p');
    stepEl.className = 'onboarding-step';
    var progressBar = document.createElement('div');
    progressBar.className = 'onboarding-progress';
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', String(steps.length));
    progressBar.setAttribute('aria-valuenow', String((resumeIndex != null ? resumeIndex : 0) + 1));
    var progressFill = document.createElement('div');
    progressFill.className = 'onboarding-progress-fill';
    progressBar.appendChild(progressFill);
    meta.appendChild(stepEl);
    meta.appendChild(progressBar);

    var bubble = document.createElement('div');
    bubble.className = 'onboarding-bubble';
    var titleEl = document.createElement('h3');
    titleEl.className = 'onboarding-title';
    var textEl = document.createElement('p');
    textEl.className = 'onboarding-text';
    var hintEl = document.createElement('p');
    hintEl.className = 'onboarding-hint';
    hintEl.hidden = true;
    var statusEl = document.createElement('p');
    statusEl.className = 'onboarding-status';
    bubble.appendChild(titleEl);
    bubble.appendChild(textEl);
    bubble.appendChild(hintEl);
    bubble.appendChild(statusEl);

    var actions = document.createElement('div');
    actions.className = 'onboarding-actions';

    var skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-secondary onboarding-btn onboarding-skip-btn';
    skipBtn.textContent = 'Позже';
    skipBtn.title = 'Esc — продолжить позже';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn-secondary onboarding-btn';
    prevBtn.textContent = 'Назад';

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-primary onboarding-btn onboarding-next-btn';
    nextBtn.textContent = 'Далее';
    nextBtn.title = 'Enter — следующий шаг';

    actions.appendChild(skipBtn);
    actions.appendChild(prevBtn);
    actions.appendChild(nextBtn);

    var spotlight = document.createElement('div');
    spotlight.className = 'onboarding-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');

    card.appendChild(cardBg);
    card.appendChild(hero);
    card.appendChild(meta);
    card.appendChild(bubble);
    card.appendChild(actions);
    overlay.appendChild(spotlight);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (typeof window.initPanelPlexusCanvases === 'function') {
        requestAnimationFrame(function() {
            window.initPanelPlexusCanvases(card);
        });
    }

    onboardingState = {
        index: (resumeIndex != null ? resumeIndex : 0),
        steps: steps,
        overlay: overlay,
        card: card,
        avatarEl: avatar,
        spotlightEl: spotlight,
        progressBar: progressBar,
        progressFill: progressFill,
        metaEl: meta,
        stepEl: stepEl,
        titleEl: titleEl,
        textEl: textEl,
        hintEl: hintEl,
        statusEl: statusEl,
        actionsEl: actions,
        prevBtn: prevBtn,
        nextBtn: nextBtn,
        activeTarget: null,
        previousStep: null,
        stepCleanup: null,
        completing: false,
        reposition: function() {
            if (!onboardingState || onboardingState.completing) return;
            repositionOnboardingUi();
        }
    };

    skipBtn.addEventListener('click', function() {
        stopOnboardingTour(false);
    });
    prevBtn.addEventListener('click', function() {
        if (!onboardingState || onboardingState.index === 0) return;
        onboardingState.index -= 1;
        renderOnboardingStep();
    });
    nextBtn.addEventListener('click', function() {
        if (!onboardingState || onboardingState.completing) return;
        evaluateOnboardingStepCompletion();
        var currentStep = onboardingState.steps[onboardingState.index];
        if (currentStep && currentStep.requireAction && onboardingState.nextBtn.disabled) return;
        if (onboardingState.index >= onboardingState.steps.length - 1) {
            onboardingState.completing = true;
            showOnboardingCompletionAndFinish();
            return;
        }
        onboardingState.index += 1;
        renderOnboardingStep();
    });

    var onKeyboard = function(e) {
        if (!onboardingState || onboardingState.completing) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            stopOnboardingTour(false);
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) return;
            if (!onboardingState.nextBtn.disabled) {
                e.preventDefault();
                onboardingState.nextBtn.click();
            }
            return;
        }
        if (e.key === 'ArrowRight' && !onboardingState.nextBtn.disabled) {
            e.preventDefault();
            onboardingState.nextBtn.click();
            return;
        }
        if (e.key === 'ArrowLeft' && !onboardingState.prevBtn.disabled) {
            e.preventDefault();
            onboardingState.prevBtn.click();
        }
    };
    document.addEventListener('keydown', onKeyboard);
    onboardingState.detachKeyboard = function() {
        document.removeEventListener('keydown', onKeyboard);
    };

    var onAnyProgressSignal = function() {
        // Дожидаемся завершения штатных обработчиков UI (переключение режимов и т.п.)
        // и только потом проверяем выполнение шага + позицию подсветки после сдвига layout.
        setTimeout(function() {
            evaluateOnboardingStepCompletion();
            scheduleOnboardingReposition();
        }, 0);
    };
    document.addEventListener('click', onAnyProgressSignal);
    document.addEventListener('change', onAnyProgressSignal);
    document.addEventListener('keyup', onAnyProgressSignal);

    onboardingState.detachProgressSignals = function() {
        document.removeEventListener('click', onAnyProgressSignal);
        document.removeEventListener('change', onAnyProgressSignal);
        document.removeEventListener('keyup', onAnyProgressSignal);
    };

    window.addEventListener('resize', onboardingState.reposition, true);
    window.addEventListener('scroll', onboardingState.reposition, true);
    renderOnboardingStep();
}

window.startOnboardingTour = startOnboardingTour;
window.restartOnboardingTour = function() {
    clearOnboardingCompletedFlag();
    clearOnboardingProgress();
    stopOnboardingTour(false);
    startOnboardingTour({ resumeFromSaved: false, force: true });
};
window.isOnboardingAllowedForCurrentDevice = isOnboardingAllowedForCurrentDevice;
window.isOnboardingEditStepsAllowed = isOnboardingEditStepsAllowed;

function resumeOnboardingTourIfNeeded() {
    if (!isOnboardingAllowedForCurrentDevice()) return false;
    if (hasOnboardingCompleted()) return false;
    var idx = getSavedOnboardingProgressIndex(getOnboardingSteps().length);
    if (idx == null) return false;
    var wm = document.getElementById('welcomeModal');
    if (wm && wm.style.display !== 'none') closeWelcomeModal();
    setTimeout(function() {
        startOnboardingTour({ resumeFromSaved: true });
    }, 140);
    return true;
}

function closeWelcomeModal() {
    var wm = document.getElementById('welcomeModal');
    if (!wm) return;
    wm.style.display = 'none';
    wm.classList.remove('modal--centered');
    wm.setAttribute('aria-hidden', 'true');
    try { localStorage.setItem(getWelcomeDismissedKeyForCurrentUser(), '1'); } catch (e) {}
}

function initWelcomeModal() {
    var wm = document.getElementById('welcomeModal');
    if (!wm || wm._welcomeBound) return;
    try {
        if (localStorage.getItem(getWelcomeDismissedKeyForCurrentUser())) return;
    } catch (e) {}
    wm._welcomeBound = true;
    var showWelcome = function() {
        wm.style.display = 'flex';
        wm.classList.add('modal--centered');
        wm.setAttribute('aria-hidden', 'false');
    };
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(showWelcome);
    } else {
        showWelcome();
    }
    function onClose() {
        closeWelcomeModal();
    }
    wm.addEventListener('click', function(e) {
        if (e.target === wm) onClose();
    });
    var closeBtn = document.getElementById('welcomeModalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', onClose);
        closeBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
            }
        });
    }
    var okBtn = document.getElementById('welcomeModalOk');
    if (okBtn) okBtn.addEventListener('click', onClose);
    var startTourBtn = document.getElementById('welcomeModalStartTour');
    if (startTourBtn) {
        if (!isOnboardingAllowedForCurrentDevice()) {
            startTourBtn.style.display = 'none';
            return;
        }
        startTourBtn.style.display = '';
        startTourBtn.addEventListener('click', function() {
            closeWelcomeModal();
            setTimeout(function() { startOnboardingTour(); }, 120);
        });
    }
}
