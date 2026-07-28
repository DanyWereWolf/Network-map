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
        var query = this.value.trim();
        if (query.length < 2) return;
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
            const results = searchObjects(query);
            renderSearchResults(results, query);
        }, 200);
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
        if (type === 'signalPost') {
            var comment = obj.properties.get('comment') || '';
            if (comment && comment.toLowerCase().indexOf(lowerQuery) !== -1) {
                results.push({ object: obj, type: type, name: searchName || comment, matchType: 'name' });
                return;
            }
        }
        if (type === 'node' && typeof getNodeAttachedSwitches === 'function') {
            var attached = getNodeAttachedSwitches(obj);
            for (var ai = 0; ai < attached.length; ai++) {
                var sw = attached[ai];
                var sn = (sw && sw.name) ? String(sw.name).trim() : '';
                if (!sn || sn.toLowerCase().indexOf(lowerQuery) === -1) continue;
                results.push({
                    object: obj,
                    type: 'node',
                    name: sn,
                    matchType: 'name',
                    labelType: 'switchInNode',
                    parentNodeName: searchName || ''
                });
            }
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
        var emptyAvatar = window.AssistantAvatars
            ? AssistantAvatars.imgHtml('question', 'search-no-results-avatar')
            : '<img class="search-no-results-avatar" src="icons/assistant/vola-question.png" alt="" aria-hidden="true" decoding="async">';
        searchResults.innerHTML = '<div class="search-no-results">' + emptyAvatar +
            '<p>Ничего не найдено по запросу «' + escapeHtml(query) + '»</p></div>';
        searchResults.style.display = 'block';
        return;
    }
    var getIcon = function(type) {
        switch (type) {
            case 'node': return '🖥️';
            case 'cross': return '📦';
            case 'sleeve': return '🔴';
            case 'spliceCassette': return '🟠';
            case 'support': return '📍';
            case 'attachment': return '🔗';
            case 'signalPost': return '🚏';
            case 'camera': return '📷';
            case 'cable': return '🔌';
            case 'region': return '⬡';
            default: return '📍';
        }
    };
    var html = '<div class="search-results-header">Найдено: ' + results.length + '</div>';
    results.forEach(function(result, index) {
        var typeName = result.labelType === 'switchInNode' ? 'Коммутатор в узле' : getObjectTypeName(result.type);
        var icon = result.labelType === 'switchInNode' ? '🔀' : getIcon(result.type);
        var uniqueId = result.object.properties.get('uniqueId') || index;
        html += '<div class="search-result-item" data-index="' + index + '" data-id="' + escapeHtml(String(uniqueId)) + '">' +
            '<div class="search-result-icon ' + result.type + '">' + icon + '</div>' +
            '<div class="search-result-info"><div class="search-result-name">' + escapeHtml(result.name) + '</div>' +
            '<div class="search-result-type">' + escapeHtml(typeName) +
            (result.labelType === 'switchInNode' && result.parentNodeName ? ' · ' + escapeHtml(result.parentNodeName) : '') +
            '</div></div></div>';
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
    if (result.type === 'region' && window.MapRegions) {
        var ring = MapRegions.getRegionRing(obj);
        if (ring.length >= 3) {
            var lats = ring.map(function(c) { return c[0]; });
            var lons = ring.map(function(c) { return c[1]; });
            myMap.setBounds([[Math.min.apply(null, lats), Math.min.apply(null, lons)], [Math.max.apply(null, lats), Math.max.apply(null, lons)]], { checkZoomRange: true, duration: typeof mapMotionDuration === 'function' ? mapMotionDuration(500) : 500 });
            setTimeout(function() { focusRegionOnMap(obj); }, typeof mapMotionDuration === 'function' && mapMotionDuration(500) === 0 ? 0 : 600);
            searchInput.value = '';
            var clearElR = document.getElementById('clearSearch');
            if (clearElR) clearElR.style.display = 'none';
            return;
        }
    }
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
    if (typeof mapGeoPin === 'function') mapGeoPin(obj);
    myMap.setCenter(coords, 21, { duration: typeof mapMotionDuration === 'function' ? mapMotionDuration(500) : 500 });
    setTimeout(function() {
        if (result.type === 'cable') showCableInfo(obj);
        else if (result.type === 'support' || result.type === 'attachment' || result.type === 'manhole') showSupportInfo(obj);
        else if (result.type === 'signalPost') showSignalPostInfo(obj);
        else if (result.type === 'region') focusRegionOnMap(obj);
        else if (result.type === 'node' || result.type === 'cross' || result.type === 'sleeve' || result.type === 'spliceCassette' || result.type === 'olt' || result.type === 'splitter' || result.type === 'onu' || result.type === 'camera') showObjectInfo(obj);
    }, 600);
    searchInput.value = '';
    var clearEl = document.getElementById('clearSearch');
    if (clearEl) clearEl.style.display = 'none';
}
