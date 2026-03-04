/**
 * Поиск по карте.
 */
function setupMapSearch() {
    const searchInput = document.getElementById('mapSearch');
    const searchResults = document.getElementById('searchResults');
    const clearBtn = document.getElementById('clearSearch');
    
    if (!searchInput || !searchResults) return;
    
    let searchTimeout = null;

    searchInput.addEventListener('input', function() {
        const query = this.value.trim();
        clearBtn.style.display = query ? 'flex' : 'none';
        if (searchTimeout) clearTimeout(searchTimeout);
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }
        searchTimeout = setTimeout(function() {
            const results = searchObjects(query);
            renderSearchResults(results, query);
        }, 200);
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchResults.style.display = 'none';
        clearBtn.style.display = 'none';
        searchInput.focus();
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.header-search')) {
            searchResults.style.display = 'none';
        }
    });

    searchInput.addEventListener('focus', function() {
        if (this.value.trim().length >= 2) {
            const results = searchObjects(this.value.trim());
            renderSearchResults(results, this.value.trim());
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        const items = searchResults.querySelectorAll('.search-result-item');
        const activeItem = searchResults.querySelector('.search-result-item.active');
        let activeIndex = Array.from(items).indexOf(activeItem);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeIndex < items.length - 1) {
                if (items[activeIndex]) items[activeIndex].classList.remove('active');
                items[activeIndex + 1].classList.add('active');
                items[activeIndex + 1].scrollIntoView({ block: 'nearest' });
            } else if (activeIndex === -1 && items.length > 0) {
                items[0].classList.add('active');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeIndex > 0) {
                items[activeIndex].classList.remove('active');
                items[activeIndex - 1].classList.add('active');
                items[activeIndex - 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeItem) activeItem.click();
            else if (items.length > 0) items[0].click();
        } else if (e.key === 'Escape') {
            searchResults.style.display = 'none';
            searchInput.blur();
        }
    });
}

function searchObjects(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        const name = obj.properties.get('name') || '';
        const cableName = obj.properties.get('cableName') || '';
        const searchName = type === 'cable' ? cableName : name;
        if (searchName && searchName.toLowerCase().indexOf(lowerQuery) !== -1) {
            results.push({ object: obj, type: type, name: searchName, matchType: 'name' });
            return;
        }
        const typeName = getObjectTypeName(type);
        if (typeName.toLowerCase().indexOf(lowerQuery) !== -1) {
            results.push({ object: obj, type: type, name: searchName || typeName, matchType: 'type' });
        }
    });
    results.sort(function(a, b) {
        if (a.matchType === 'name' && b.matchType !== 'name') return -1;
        if (a.matchType !== 'name' && b.matchType === 'name') return 1;
        return a.name.localeCompare(b.name);
    });
    return results.slice(0, 20);
}

function renderSearchResults(results, query) {
    const searchResults = document.getElementById('searchResults');
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-no-results"><div style="font-size: 24px; margin-bottom: 8px;">🔍</div>Ничего не найдено по запросу "' + escapeHtml(query) + '"</div>';
        searchResults.style.display = 'block';
        return;
    }
    var getIcon = function(type) {
        switch (type) {
            case 'node': return '🖥️';
            case 'cross': return '📦';
            case 'sleeve': return '🔴';
            case 'support': return '📍';
            case 'attachment': return '🔗';
            case 'cable': return '🔌';
            default: return '📍';
        }
    };
    var html = '<div class="search-results-header">Найдено: ' + results.length + '</div>';
    results.forEach(function(result, index) {
        var typeName = getObjectTypeName(result.type);
        var icon = getIcon(result.type);
        var uniqueId = result.object.properties.get('uniqueId') || index;
        html += '<div class="search-result-item" data-index="' + index + '" data-id="' + escapeHtml(String(uniqueId)) + '">' +
            '<div class="search-result-icon ' + result.type + '">' + icon + '</div>' +
            '<div class="search-result-info"><div class="search-result-name">' + escapeHtml(result.name) + '</div>' +
            '<div class="search-result-type">' + typeName + '</div></div></div>';
    });
    searchResults.innerHTML = html;
    searchResults.style.display = 'block';
    searchResults.querySelectorAll('.search-result-item').forEach(function(item, index) {
        item.addEventListener('click', function() { goToSearchResult(results[index]); });
        item.addEventListener('mouseenter', function() {
            var active = searchResults.querySelector('.search-result-item.active');
            if (active) active.classList.remove('active');
            item.classList.add('active');
        });
    });
}

function goToSearchResult(result) {
    var obj = result.object;
    var searchResults = document.getElementById('searchResults');
    var searchInput = document.getElementById('mapSearch');
    searchResults.style.display = 'none';
    var coords;
    if (result.type === 'cable') {
        var geometry = obj.geometry.getCoordinates();
        if (geometry && geometry.length >= 2) {
            var midIndex = Math.floor(geometry.length / 2);
            coords = geometry[midIndex];
        }
    } else {
        coords = obj.geometry.getCoordinates();
    }
    if (!coords) return;
    myMap.setCenter(coords, 21, { duration: 500 });
    setTimeout(function() {
        if (result.type === 'cable') showCableInfo(obj);
        else if (result.type === 'support') showSupportInfo(obj);
        else if (result.type === 'node' || result.type === 'cross' || result.type === 'sleeve') showObjectInfo(obj);
    }, 600);
    searchInput.value = '';
    var clearEl = document.getElementById('clearSearch');
    if (clearEl) clearEl.style.display = 'none';
}
