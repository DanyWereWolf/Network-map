/**
 * Логические регионы-разделы карты + миграция полигонов region→zone.
 * Чистые функции без доступа к store — используются database.js и sync.
 */
'use strict';

var MAP_REGION_SOFT_LIMIT = 10000;
var MAP_REGION_SOFT_WARN_AT = 9000;

function generateMapRegionId() {
    return 'reg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function itemMapRegionId(item) {
    if (!item || typeof item !== 'object') return null;
    var id = item.mapRegionId;
    if (id == null || id === '') return null;
    return String(id);
}

function migrateZoneFieldsOnItem(item) {
    if (!item || typeof item !== 'object') return false;
    var changed = false;
    if (item.type === 'region') {
        item.type = 'zone';
        changed = true;
        if (item.zoneVisible === undefined && item.regionVisible !== undefined) {
            item.zoneVisible = item.regionVisible;
        }
        if (item.zoneFillVisible === undefined && item.regionFillVisible !== undefined) {
            item.zoneFillVisible = item.regionFillVisible;
        }
    }
    if (item.type === 'regionLabel') {
        item.type = 'zoneLabel';
        changed = true;
        if (item.parentZoneId == null && item.parentRegionId != null) {
            item.parentZoneId = item.parentRegionId;
        }
    }
    return changed;
}

function normalizeRegionsList(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    list.forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        var id = r.id != null ? String(r.id) : '';
        if (!id || seen[id]) return;
        seen[id] = 1;
        var name = (r.name != null && String(r.name).trim()) ? String(r.name).trim() : 'Регион';
        out.push({
            id: id,
            name: name,
            createdAt: r.createdAt || null
        });
    });
    return out;
}

function filterItemsByRegionId(arr, regionId) {
    var rid = regionId != null ? String(regionId) : '';
    if (!rid || !Array.isArray(arr)) return [];
    return arr.filter(function (item) {
        return itemMapRegionId(item) === rid;
    });
}

/**
 * Заменяет в full все items региона regionId на slice (с проставленным mapRegionId).
 * Остальные регионы не трогает.
 */
function mergeRegionSliceIntoFull(fullArr, regionId, sliceArr) {
    var rid = regionId != null ? String(regionId) : '';
    if (!rid) throw new Error('regionId required');
    var full = Array.isArray(fullArr) ? fullArr.slice() : [];
    var kept = full.filter(function (item) {
        return itemMapRegionId(item) !== rid;
    });
    var slice = Array.isArray(sliceArr) ? sliceArr : [];
    var tagged = slice.map(function (item) {
        if (!item || typeof item !== 'object') return item;
        var copy = item;
        // shallow: callers usually pass plain JSON
        if (itemMapRegionId(copy) !== rid) {
            copy = Object.assign({}, item, { mapRegionId: rid });
        }
        migrateZoneFieldsOnItem(copy);
        return copy;
    }).filter(Boolean);
    return kept.concat(tagged);
}

function softWarnForCount(count) {
    var n = count | 0;
    if (n >= MAP_REGION_SOFT_LIMIT) {
        return {
            level: 'danger',
            at: n,
            limit: MAP_REGION_SOFT_LIMIT,
            text: 'В регионе уже ' + n + ' объектов (рекомендуемый максимум ' + MAP_REGION_SOFT_LIMIT + '). Создайте ещё один регион и перенесите часть объектов — так карта будет загружаться быстрее.'
        };
    }
    if (n >= MAP_REGION_SOFT_WARN_AT) {
        return {
            level: 'warn',
            at: n,
            limit: MAP_REGION_SOFT_LIMIT,
            text: 'В регионе почти ' + MAP_REGION_SOFT_LIMIT + ' объектов (' + n + '). Рекомендуем создать ещё один регион и перенести часть объектов.'
        };
    }
    return null;
}

function assertRegionSliceNotDangerousShrink(previousFull, regionId, nextSlice, opts) {
    opts = opts || {};
    if (opts.allowShrink) return { ok: true };
    var prevSlice = filterItemsByRegionId(previousFull, regionId);
    var prevLen = prevSlice.length;
    var nextLen = Array.isArray(nextSlice) ? nextSlice.length : 0;
    var MAP_SHRINK_MIN_EXISTING = 50;
    var MAP_SHRINK_RATIO = 0.5;
    if (prevLen >= MAP_SHRINK_MIN_EXISTING) {
        if (nextLen === 0 || nextLen < Math.floor(prevLen * MAP_SHRINK_RATIO)) {
            return {
                ok: false,
                code: 'MAP_SHRINK',
                error: 'Отказ: нельзя заменить регион из ' + prevLen + ' объектов на ' + nextLen + ' без явного подтверждения',
                previous: prevLen,
                next: nextLen
            };
        }
    }
    return { ok: true, previous: prevLen, next: nextLen };
}

module.exports = {
    MAP_REGION_SOFT_LIMIT: MAP_REGION_SOFT_LIMIT,
    MAP_REGION_SOFT_WARN_AT: MAP_REGION_SOFT_WARN_AT,
    generateMapRegionId: generateMapRegionId,
    itemMapRegionId: itemMapRegionId,
    migrateZoneFieldsOnItem: migrateZoneFieldsOnItem,
    normalizeRegionsList: normalizeRegionsList,
    filterItemsByRegionId: filterItemsByRegionId,
    mergeRegionSliceIntoFull: mergeRegionSliceIntoFull,
    softWarnForCount: softWarnForCount,
    assertRegionSliceNotDangerousShrink: assertRegionSliceNotDangerousShrink
};
