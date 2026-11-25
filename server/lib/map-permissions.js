'use strict';

/**
 * Map access helpers: admin | editor | viewer (+ legacy "user" → viewer).
 */

function normalizeMapRole(role) {
    var r = role == null ? '' : String(role).trim().toLowerCase();
    if (r === 'admin') return 'admin';
    if (r === 'editor') return 'editor';
    if (r === 'viewer' || r === 'user') return 'viewer';
    return 'viewer';
}

function normalizeAllowedRegionIds(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length; i++) {
        var id = raw[i] != null ? String(raw[i]).trim() : '';
        if (!id || seen[id]) continue;
        seen[id] = true;
        out.push(id);
    }
    return out;
}

function coerceBool(value, defaultValue) {
    if (value === undefined || value === null) return !!defaultValue;
    return !!value;
}

function migrateUserRecord(user) {
    if (!user || typeof user !== 'object') return user;
    var role = normalizeMapRole(user.role);
    if (user.role === 'user' || (user.role && user.role !== role)) {
        user.role = role;
    } else if (!user.role) {
        user.role = role;
    }
    if (!Array.isArray(user.allowedRegionIds)) {
        user.allowedRegionIds = [];
    } else {
        user.allowedRegionIds = normalizeAllowedRegionIds(user.allowedRegionIds);
    }
    if (role === 'admin') {
        user.canDeleteObjects = true;
        user.canDeleteCables = true;
        user.allowedRegionIds = [];
    } else if (role === 'viewer') {
        user.canDeleteObjects = false;
        user.canDeleteCables = false;
    } else {
        user.canDeleteObjects = coerceBool(user.canDeleteObjects, true);
        user.canDeleteCables = coerceBool(user.canDeleteCables, true);
    }
    return user;
}

function isGlobalAdmin(user) {
    return !!(user && normalizeMapRole(user.role) === 'admin' && (user.organizationId == null));
}

function isOrgAdmin(user) {
    return !!(user && normalizeMapRole(user.role) === 'admin' && user.organizationId);
}

function canEditMap(user) {
    if (!user || user.embed || user.share) return false;
    var role = normalizeMapRole(user.role);
    return role === 'admin' || role === 'editor';
}

function canDeleteObjects(user) {
    if (!canEditMap(user)) return false;
    if (normalizeMapRole(user.role) === 'admin') return true;
    return coerceBool(user.canDeleteObjects, true);
}

function canDeleteCables(user) {
    if (!canEditMap(user)) return false;
    if (normalizeMapRole(user.role) === 'admin') return true;
    return coerceBool(user.canDeleteCables, true);
}

function getAllowedRegionIds(user) {
    if (!user) return [];
    if (normalizeMapRole(user.role) === 'admin' && user.organizationId) return [];
    return normalizeAllowedRegionIds(user.allowedRegionIds);
}

/** Empty allowedRegionIds = all regions of the org. */
function userHasFullRegionAccess(user) {
    if (!user) return false;
    if (normalizeMapRole(user.role) === 'admin') return true;
    return getAllowedRegionIds(user).length === 0;
}

function userCanAccessRegion(user, regionId) {
    if (!user) return false;
    if (userHasFullRegionAccess(user)) return true;
    var rid = regionId != null ? String(regionId).trim() : '';
    if (!rid) return false;
    var allowed = getAllowedRegionIds(user);
    return allowed.indexOf(rid) !== -1;
}

function filterRegionsForUser(user, regions) {
    if (!Array.isArray(regions)) return [];
    if (userHasFullRegionAccess(user)) return regions;
    var allowed = getAllowedRegionIds(user);
    if (!allowed.length) return regions;
    var set = Object.create(null);
    for (var i = 0; i < allowed.length; i++) set[allowed[i]] = true;
    return regions.filter(function (r) {
        return r && r.id != null && set[String(r.id)];
    });
}

function itemKey(item) {
    if (!item || typeof item !== 'object') return '';
    if (item.uniqueId != null && item.uniqueId !== '') return String(item.uniqueId);
    return '';
}

function detectMapRemovals(prevItems, nextItems) {
    var prev = Array.isArray(prevItems) ? prevItems : [];
    var next = Array.isArray(nextItems) ? nextItems : [];
    var nextKeys = Object.create(null);
    for (var i = 0; i < next.length; i++) {
        var nk = itemKey(next[i]);
        if (nk) nextKeys[nk] = true;
    }
    var removedObjects = [];
    var removedCables = [];
    for (var j = 0; j < prev.length; j++) {
        var item = prev[j];
        var k = itemKey(item);
        if (!k || nextKeys[k]) continue;
        if (item.type === 'cable') removedCables.push(k);
        else removedObjects.push(k);
    }
    return { removedObjects: removedObjects, removedCables: removedCables };
}

function assertMaySaveMapSlice(user, prevSlice, nextSlice, opts) {
    opts = opts || {};
    if (!canEditMap(user)) {
        return { ok: false, status: 403, error: 'Недостаточно прав для сохранения карты' };
    }
    var regionId = opts.regionId != null ? String(opts.regionId).trim() : '';
    if (regionId && !userCanAccessRegion(user, regionId)) {
        return { ok: false, status: 403, error: 'Нет доступа к этому региону карты', code: 'MAP_REGION_FORBIDDEN' };
    }
    if (opts.replaceAll && !isOrgAdmin(user) && !isGlobalAdmin(user)) {
        return { ok: false, status: 403, error: 'Полная замена карты доступна только администратору организации' };
    }
    if (normalizeMapRole(user.role) === 'admin') return { ok: true };
    var rem = detectMapRemovals(prevSlice, nextSlice);
    if (rem.removedObjects.length && !canDeleteObjects(user)) {
        return {
            ok: false,
            status: 403,
            error: 'Удаление объектов запрещено для вашей роли',
            code: 'MAP_DELETE_OBJECTS_FORBIDDEN',
            removed: rem.removedObjects.length
        };
    }
    if (rem.removedCables.length && !canDeleteCables(user)) {
        return {
            ok: false,
            status: 403,
            error: 'Удаление кабелей запрещено для вашей роли',
            code: 'MAP_DELETE_CABLES_FORBIDDEN',
            removed: rem.removedCables.length
        };
    }
    return { ok: true };
}

function permissionFieldsForClient(user) {
    var migrated = migrateUserRecord(Object.assign({}, user || {}));
    return {
        role: migrated.role,
        allowedRegionIds: migrated.allowedRegionIds.slice(),
        canDeleteObjects: !!migrated.canDeleteObjects,
        canDeleteCables: !!migrated.canDeleteCables
    };
}

function sanitizeRoleInput(role, fallback) {
    var r = normalizeMapRole(role != null ? role : fallback);
    if (role === 'admin' || role === 'editor' || role === 'viewer' || role === 'user') {
        return normalizeMapRole(role);
    }
    if (fallback != null) return normalizeMapRole(fallback);
    return 'viewer';
}

function applyPermissionFieldsFromBody(target, body) {
    if (!target || !body) return;
    if (body.role !== undefined) {
        target.role = sanitizeRoleInput(body.role, target.role || 'viewer');
    }
    if (body.allowedRegionIds !== undefined) {
        target.allowedRegionIds = normalizeAllowedRegionIds(body.allowedRegionIds);
    }
    if (body.canDeleteObjects !== undefined) {
        target.canDeleteObjects = !!body.canDeleteObjects;
    }
    if (body.canDeleteCables !== undefined) {
        target.canDeleteCables = !!body.canDeleteCables;
    }
    migrateUserRecord(target);
}

module.exports = {
    normalizeMapRole: normalizeMapRole,
    normalizeAllowedRegionIds: normalizeAllowedRegionIds,
    migrateUserRecord: migrateUserRecord,
    isGlobalAdmin: isGlobalAdmin,
    isOrgAdmin: isOrgAdmin,
    canEditMap: canEditMap,
    canDeleteObjects: canDeleteObjects,
    canDeleteCables: canDeleteCables,
    getAllowedRegionIds: getAllowedRegionIds,
    userHasFullRegionAccess: userHasFullRegionAccess,
    userCanAccessRegion: userCanAccessRegion,
    filterRegionsForUser: filterRegionsForUser,
    detectMapRemovals: detectMapRemovals,
    assertMaySaveMapSlice: assertMaySaveMapSlice,
    permissionFieldsForClient: permissionFieldsForClient,
    sanitizeRoleInput: sanitizeRoleInput,
    applyPermissionFieldsFromBody: applyPermissionFieldsFromBody
};
