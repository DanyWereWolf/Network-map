/**
 * Резервные копии организации в боковой панели.
 */
function setupBackupsSection() {
    const refreshBtn = document.getElementById('backupsRefreshBtn');
    const listEl = document.getElementById('backupsList');
    if (!refreshBtn || !listEl) return;

    refreshBtn.addEventListener('click', loadBackupsList);

    document.querySelectorAll('.accordion-header').forEach(header => {
        if (header.getAttribute('data-accordion') === 'backups') {
            header.addEventListener('click', function() {
                setTimeout(loadBackupsList, 150);
            });
        }
    });
}

var MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function groupBackupsByMonth(backups) {
    var groups = {};
    backups.forEach(function(b) {
        var dateStr = b.date || '';
        var parts = dateStr.split('-');
        var key = parts.length >= 2 ? parts[0] + '-' + parts[1] : dateStr;
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
    });
    var keys = Object.keys(groups).sort().reverse();
    return keys.map(function(k) {
        var items = groups[k];
        var first = items[0].date || '';
        var y = first.substring(0, 4), m = first.substring(5, 7);
        var monthNum = parseInt(m, 10) || 0;
        var monthLabel = (monthNum >= 1 && monthNum <= 12 ? MONTH_NAMES[monthNum - 1] : m) + ' ' + y;
        return { key: k, label: monthLabel, items: items };
    });
}

function loadBackupsList() {
    const listEl = document.getElementById('backupsList');
    if (!listEl || !getApiBase() || !getAuthToken()) return;
    listEl.innerHTML = '<div class="backups-loading">Загрузка…</div>';
    listEl.removeEventListener('click', handleBackupListClick);
    fetch(getApiBase() + '/api/backups', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) {
        if (!r.ok) throw new Error(r.status === 401 ? 'Требуется авторизация' : 'Ошибка загрузки');
        return r.json();
    }).then(function(data) {
        const backups = data.backups || [];
        if (backups.length === 0) {
            listEl.innerHTML = '<p class="backups-empty">Нет резервных копий</p>';
            return;
        }
        var groups = groupBackupsByMonth(backups);
        var html = '<div class="backups-list-scroll">';
        groups.forEach(function(gr, idx) {
            var isFirst = idx === 0;
            var openClass = isFirst ? ' backup-month-open' : '';
            html += '<div class="backup-month' + openClass + '" data-month="' + escapeHtml(gr.key) + '">';
            html += '<button type="button" class="backup-month-header" aria-expanded="' + isFirst + '">';
            html += '<span class="backup-month-label">' + escapeHtml(gr.label) + '</span>';
            html += '<span class="backup-month-count">' + gr.items.length + '</span>';
            html += '<svg class="backup-month-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            html += '</button>';
            html += '<div class="backup-month-items">';
            gr.items.forEach(function(b) {
                if (!b || !b.filename) return;
                var d = (b.date || '').split('-');
                var day = d.length >= 3 ? d[2] : b.date || '';
                var m = d.length >= 2 ? parseInt(d[1], 10) : 0;
                var shortMonth = (m >= 1 && m <= 12 ? MONTH_NAMES[m - 1].substring(0, 3) : '') || d[1];
                var rowLabel = day + ' ' + shortMonth;
                html += '<div class="backup-item">';
                html += '<span class="backup-date">' + escapeHtml(rowLabel) + '</span>';
                html += '<button type="button" class="btn-restore-backup" data-filename="' + escapeHtml(b.filename) + '" title="Восстановить на эту дату">Восстановить</button>';
                html += '</div>';
            });
            html += '</div></div>';
        });
        html += '</div>';
        listEl.innerHTML = html;
        listEl.addEventListener('click', handleBackupListClick);
        listEl.querySelectorAll('.backup-month-header').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var block = this.closest('.backup-month');
                if (block) {
                    block.classList.toggle('backup-month-open');
                    this.setAttribute('aria-expanded', block.classList.contains('backup-month-open'));
                }
            });
        });
    }).catch(function(e) {
        listEl.innerHTML = '<p class="backups-error">' + escapeHtml(e.message || 'Ошибка загрузки') + '</p>';
    });
}

function handleBackupListClick(e) {
    var btn = e.target && e.target.closest('.btn-restore-backup');
    if (!btn) return;
    var filename = btn.getAttribute('data-filename');
    if (!filename || !getApiBase() || !getAuthToken()) return;
    e.preventDefault();
    var dateLabel = filename.replace(/backup-|\.json/g, '');
    (async function() {
        if (!(await showConfirm('Восстановить данные от ' + dateLabel + '? Текущие данные будут заменены, все учётные записи организации будут отключены. После восстановления потребуется войти снова.', 'Восстановление бэкапа', { confirmText: 'Восстановить' }))) return;
    btn.disabled = true;
    fetch(getApiBase() + '/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
        body: JSON.stringify({ filename: filename })
    }).then(function(res) { return res.json().then(function(j) { return { ok: res.ok, body: j }; }); }).then(function(r) {
        if (r.ok) {
            try {
                sessionStorage.removeItem('networkMap_session');
                sessionStorage.removeItem('networkMap_token');
                localStorage.removeItem('networkMap_token');
                localStorage.removeItem('networkMap_session');
                localStorage.removeItem('networkMap_tokenExpiry');
            } catch (e) {}
            if (typeof showSuccess === 'function') showSuccess('Данные восстановлены. Все учётные записи организации отключены. Войдите снова.');
            else alert('Данные восстановлены. Все учётные записи организации отключены. Войдите снова.');
            setTimeout(function() { window.location.href = 'auth.html'; }, 800);
        } else {
            btn.disabled = false;
            var errMsg = (r.body && r.body.error) ? r.body.error : 'Ошибка восстановления';
            if (typeof showError === 'function') showError(errMsg);
            else alert(errMsg);
        }
    }).catch(function(err) {
        btn.disabled = false;
        var msg = (err && err.message) ? err.message : 'Ошибка сети';
        if (typeof showError === 'function') showError(msg);
        else alert(msg);
    });
    })();
}
