/**
 * Проверка обновлений (GitHub Releases)
 */
function parseVersion(str) {
    var s = (str || '').replace(/^v/i, '').trim();
    var parts = s.split('.').map(function(n) { return parseInt(n, 10) || 0; });
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(a, b) {
    var va = parseVersion(a);
    var vb = parseVersion(b);
    for (var i = 0; i < 3; i++) {
        if (va[i] > vb[i]) return 1;
        if (va[i] < vb[i]) return -1;
    }
    return 0;
}

function checkForUpdates(silent) {
    silent = silent === true;
    if (!GITHUB_REPO.owner || !GITHUB_REPO.repo) return Promise.resolve({ checked: false });
    var url = 'https://api.github.com/repos/' + GITHUB_REPO.owner + '/' + GITHUB_REPO.repo + '/releases/latest';
    return fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } })
        .then(function(res) {
            if (!res.ok) {
                if (!silent) showWarning('Не удалось проверить обновления.', 'Обновления');
                return { checked: true, error: res.status };
            }
            return res.json();
        })
        .then(function(data) {
            if (!data || !data.tag_name) return { checked: true };
            var latest = (data.tag_name || '').trim();
            if (!latest) {
                if (!silent) showInfo('Нет данных о последней версии.', 'Обновления');
                return { checked: true };
            }
            if (compareVersions(latest, APP_VERSION) > 0) {
                var releaseUrl = data.html_url || 'https://github.com/' + GITHUB_REPO.owner + '/' + GITHUB_REPO.repo + '/releases';
                var msg = 'Доступна версия ' + latest + ' (у вас ' + APP_VERSION + '). <a href="' + releaseUrl + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">Перейти к загрузке</a>';
                showToast(msg, 'success', 'Доступно обновление', 10000);
                return { checked: true, update: true, latest: latest, url: releaseUrl };
            }
            if (!silent) showInfo('Установлена актуальная версия ' + APP_VERSION + '.', 'Обновления');
            return { checked: true, update: false };
        })
        .catch(function(e) {
            if (!silent) showWarning('Ошибка при проверке обновлений.', 'Обновления');
            return { checked: true, error: e };
        });
}

function openUpdatesModal() {
    var modal = document.getElementById('updatesModal');
    if (!modal) return;
    var versionEl = document.getElementById('updatesVersionDisplay');
    if (versionEl) {
        versionEl.textContent = APP_VERSION;
        versionEl.className = 'version-current';
    }
    var checkBtn = document.getElementById('updatesCheckBtn');
    if (checkBtn) checkBtn.disabled = false;
    if (typeof lastUpdateCheckResult !== 'undefined' && lastUpdateCheckResult) {
        renderUpdatesModalContent(lastUpdateCheckResult);
    } else {
        renderUpdatesModalContent(null);
        var statusEl = document.getElementById('updatesStatus');
        if (statusEl) statusEl.innerHTML = 'Проверка выполняется при загрузке приложения. Закройте и откройте окно через пару секунд или нажмите «Проверить обновления».';
    }
    modal.style.display = 'block';
}

function closeUpdatesModal() {
    var modal = document.getElementById('updatesModal');
    if (modal) modal.style.display = 'none';
}

function renderUpdatesModalContent(result) {
    var versionEl = document.getElementById('updatesVersionDisplay');
    var statusEl = document.getElementById('updatesStatus');
    var checkBtn = document.getElementById('updatesCheckBtn');
    if (versionEl) {
        versionEl.textContent = APP_VERSION;
        versionEl.className = 'version-current';
    }
    if (!statusEl) return;
    if (result && result.checking) {
        statusEl.innerHTML = 'Проверка…';
        if (checkBtn) checkBtn.disabled = true;
        return;
    }
    if (checkBtn) checkBtn.disabled = false;
    if (!result || !result.checked) {
        statusEl.innerHTML = 'Проверка выполняется при загрузке приложения или нажмите «Проверить обновления».';
        return;
    }
    if (result.error) {
        statusEl.innerHTML = 'Не удалось проверить обновления. Проверьте подключение к интернету.';
        return;
    }
    if (result.update && result.latest && result.url) {
        if (versionEl) versionEl.className = 'version-current version-outdated';
        statusEl.innerHTML = 'Доступна новая версия <strong>' + escapeHtml(result.latest) + '</strong>. <a href="' + escapeHtml(result.url) + '" target="_blank" rel="noopener">Перейти к загрузке</a>';
        return;
    }
    if (versionEl) versionEl.className = 'version-current version-latest';
    statusEl.innerHTML = 'У вас установлена последняя версия.';
}

function setupUpdatesModalHandlers() {
    var closeBtn = document.querySelector('.close-updates');
    if (closeBtn) closeBtn.addEventListener('click', closeUpdatesModal);
    var modal = document.getElementById('updatesModal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeUpdatesModal(); });
    var checkBtn = document.getElementById('updatesCheckBtn');
    if (checkBtn) {
        checkBtn.addEventListener('click', function() {
            renderUpdatesModalContent({ checking: true });
            checkForUpdates(true).then(function(result) {
                lastUpdateCheckResult = result;
                renderUpdatesModalContent(result);
            });
        });
    }
}
