/**
 * Приветственное окно и интерактивный тур по интерфейсу.
 */
var WELCOME_DISMISSED_KEY = 'networkMap_welcomeDismissed';
var ONBOARDING_COMPLETED_KEY = 'networkMap_onboardingCompleted';
var ONBOARDING_PROGRESS_KEY = 'networkMap_onboardingProgress';
var ONBOARDING_VERSION = 3;
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

function openOnboardingAccordion(name) {
    var header = document.querySelector('[data-accordion="' + name + '"]');
    if (!header) return;
    var section = header.parentElement;
    if (!section) return;
    document.querySelectorAll('.accordion-section').forEach(function(s) {
        s.classList.remove('active');
    });
    section.classList.add('active');
}

function ensureSidebarVisibleForOnboarding() {
    if (!document.body.classList.contains('sidebar-collapsed')) return;
    document.body.classList.remove('sidebar-collapsed');
    var toggleBtn = document.getElementById('sidebarToggle');
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.setAttribute('aria-label', 'Скрыть панель');
        toggleBtn.setAttribute('title', 'Скрыть панель');
    }
    if (typeof myMap !== 'undefined' && myMap && myMap.container) {
        setTimeout(function() {
            try { myMap.container.fitToViewport(); } catch (e) {}
        }, 300);
    }
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
            text: 'Это карта вашей организации: узлы, кабели, кроссы, муфты и GPON. Сейчас пройдём по основным элементам интерфейса.',
            hint: 'Примерное время — около 3 минут. Можно прервать и продолжить позже.'
        },
        {
            selector: '#sidebar',
            title: 'Боковая панель',
            text: 'Здесь режим работы, добавление объектов и кабелей, фильтры и статистика.',
            hint: 'Свернуть панель можно кнопкой-закладкой на правом краю экрана.',
            prepare: ensureSidebarVisibleForOnboarding,
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
            text: 'Колёсико — масштаб, перетаскивание — сдвиг. Клик по объекту откроет карточку; по кроссу или муфте — рабочее место жил.',
            preferredPlacement: 'left'
        }
    ];

    if (isOnboardingEditStepsAllowed()) {
        steps.push(
            {
                selector: '#editMode',
                title: 'Режим редактирования',
                text: 'Переключитесь в «Редактирование», чтобы добавлять и менять объекты на карте.',
                requireAction: true,
                prepare: ensureSidebarVisibleForOnboarding,
                isComplete: function() {
                    if (typeof isEditMode !== 'undefined' && isEditMode) return true;
                    var editBtn = document.getElementById('editMode');
                    return !!(editBtn && editBtn.classList.contains('active'));
                }
            },
            {
                selector: '.object-type-picker',
                title: 'Выбор типа объекта',
                text: 'Выберите тип в списке — например, опору или узел. При необходимости заполните параметры ниже.',
                requireAction: true,
                prepare: function() {
                    ensureSidebarVisibleForOnboarding();
                    openOnboardingAccordion('objects');
                },
                isComplete: function(step) {
                    var select = document.getElementById('objectType');
                    if (!select) return false;
                    return !!String(select.value || '') && !!step._interacted;
                },
                setup: function(step) {
                    var select = document.getElementById('objectType');
                    var picker = document.querySelector('.object-type-picker');
                    step._interacted = false;
                    if (!select || !picker) return null;
                    var onChange = function() { step._interacted = true; };
                    var onClick = function(e) {
                        var chip = e.target && e.target.closest ? e.target.closest('.object-type-chip') : null;
                        if (chip) step._interacted = true;
                    };
                    select.addEventListener('change', onChange);
                    picker.addEventListener('click', onClick);
                    return function() {
                        select.removeEventListener('change', onChange);
                        picker.removeEventListener('click', onClick);
                    };
                }
            },
            {
                selector: '#addObject',
                title: 'Добавление на карту',
                text: 'Нажмите «Добавить на карту» — курсор перейдёт в режим размещения.',
                preferredPlacement: 'right',
                requireAction: true,
                prepare: function() {
                    ensureSidebarVisibleForOnboarding();
                    openOnboardingAccordion('objects');
                },
                isComplete: function() {
                    var addBtn = document.getElementById('addObject');
                    return !!(addBtn && addBtn.classList.contains('btn-add-object--placement'));
                }
            },
            {
                selector: '#map',
                title: 'Размещение объекта',
                text: 'Кликните по карте в нужном месте — объект появится на карте и сохранится для команды.',
                requireAction: true,
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
                selector: '[data-accordion="cables"]',
                title: 'Прокладка кабелей',
                text: 'В разделе «Кабели» выберите тип линии и проложите маршрут по опорам и колодцам. Медные линии — из карточки узла или медиаконвертера.',
                prepare: function() {
                    ensureSidebarVisibleForOnboarding();
                    openOnboardingAccordion('cables');
                },
                preferredPlacement: 'right'
            }
        );
    } else {
        steps.push({
            selector: '#viewMode',
            title: 'Режим просмотра',
            text: 'Вы работаете в режиме просмотра: карту можно изучать и трассировать, а изменения доступны администраторам организации.',
            prepare: ensureSidebarVisibleForOnboarding
        });
    }

    steps.push(
        {
            selector: '#mapFilterBadge',
            title: 'Видимость объектов',
            text: 'Скройте лишние типы, чтобы не перегружать карту. При отдалении мелкие подписи скрываются — приблизьте для деталей.',
            prepare: function() {
                ensureSidebarVisibleForOnboarding();
                openOnboardingAccordion('mapfilter');
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

    var target = step.selector ? document.querySelector(step.selector) : null;
    onboardingState.activeTarget = target || null;

    if (target && typeof target.scrollIntoView === 'function' && !step.disableAutoScroll) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        target.classList.add('onboarding-highlight');
    } else if (target) {
        target.classList.add('onboarding-highlight');
    }

    var stepNum = onboardingState.index + 1;
    var stepTotal = onboardingState.steps.length;
    onboardingState.stepEl.textContent = 'Шаг ' + String(stepNum) + ' из ' + String(stepTotal);
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
    onboardingState.stepEl.textContent = 'Обучение завершено';
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
    card.className = 'onboarding-card';

    var header = document.createElement('div');
    header.className = 'onboarding-header';
    var avatar = document.createElement('img');
    avatar.className = 'onboarding-avatar';
    avatar.src = window.AssistantAvatars
        ? AssistantAvatars.getSrc('cheer')
        : 'icons/assistant/vola-cheer.png';
    avatar.alt = '';
    avatar.setAttribute('aria-hidden', 'true');
    var headerText = document.createElement('div');
    headerText.className = 'onboarding-header-text';
    var headerLabel = document.createElement('p');
    headerLabel.className = 'onboarding-header-label';
    headerLabel.textContent = 'Вола · обучение';
    headerText.appendChild(headerLabel);
    header.appendChild(avatar);
    header.appendChild(headerText);

    var progressBar = document.createElement('div');
    progressBar.className = 'onboarding-progress';
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', String(steps.length));
    progressBar.setAttribute('aria-valuenow', String((resumeIndex != null ? resumeIndex : 0) + 1));
    var progressFill = document.createElement('div');
    progressFill.className = 'onboarding-progress-fill';
    progressBar.appendChild(progressFill);

    var stepEl = document.createElement('p');
    stepEl.className = 'onboarding-step';
    var titleEl = document.createElement('h3');
    titleEl.className = 'onboarding-title';
    var textEl = document.createElement('p');
    textEl.className = 'onboarding-text';
    var hintEl = document.createElement('p');
    hintEl.className = 'onboarding-hint';
    hintEl.hidden = true;
    var statusEl = document.createElement('p');
    statusEl.className = 'onboarding-status';

    var actions = document.createElement('div');
    actions.className = 'onboarding-actions';

    var skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-secondary onboarding-skip-btn';
    skipBtn.textContent = 'Продолжить позже';
    skipBtn.title = 'Esc — продолжить позже';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn-secondary';
    prevBtn.textContent = 'Назад';

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-primary';
    nextBtn.textContent = 'Далее';
    nextBtn.title = 'Enter — следующий шаг';

    actions.appendChild(skipBtn);
    actions.appendChild(prevBtn);
    actions.appendChild(nextBtn);

    var spotlight = document.createElement('div');
    spotlight.className = 'onboarding-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');

    card.appendChild(header);
    card.appendChild(progressBar);
    card.appendChild(stepEl);
    card.appendChild(titleEl);
    card.appendChild(textEl);
    card.appendChild(hintEl);
    card.appendChild(statusEl);
    card.appendChild(actions);
    overlay.appendChild(spotlight);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    onboardingState = {
        index: (resumeIndex != null ? resumeIndex : 0),
        steps: steps,
        overlay: overlay,
        card: card,
        avatarEl: avatar,
        spotlightEl: spotlight,
        progressBar: progressBar,
        progressFill: progressFill,
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
            var currentStep = onboardingState.steps[onboardingState.index];
            positionOnboardingCard(onboardingState.card, onboardingState.activeTarget, currentStep);
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
        // и только потом проверяем выполнение шага.
        setTimeout(function() {
            evaluateOnboardingStepCompletion();
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
    if (!isOnboardingAllowedForCurrentDevice()) return;
    if (hasOnboardingCompleted()) return;
    var idx = getSavedOnboardingProgressIndex(getOnboardingSteps().length);
    if (idx == null) return;
    var wm = document.getElementById('welcomeModal');
    if (wm && wm.style.display !== 'none') closeWelcomeModal();
    setTimeout(function() {
        startOnboardingTour({ resumeFromSaved: true });
    }, 140);
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
    if (!wm) return;
    try {
        if (localStorage.getItem(getWelcomeDismissedKeyForCurrentUser())) return;
    } catch (e) {}
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
