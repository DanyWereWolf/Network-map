/**
 * Группы кроссов и узлов.
 */
/** ~6.6 м — радиус объединения в группу (меньше смещения «Вынести» 0.00008 ≈ 8.8 м). */
var GROUP_MERGE_EPS = 0.00006;

function groupKey(coords) {
    return coords[0].toFixed(5) + ',' + coords[1].toFixed(5);
}

function coordsWithinGroupMergeDistance(coordsA, coordsB) {
    if (!coordsA || !coordsB || coordsA.length < 2 || coordsB.length < 2) return false;
    return Math.abs(coordsA[0] - coordsB[0]) <= GROUP_MERGE_EPS &&
        Math.abs(coordsA[1] - coordsB[1]) <= GROUP_MERGE_EPS;
}

function coordsInSameObjectGroup(coordsA, coordsB) {
    if (!coordsA || !coordsB) return false;
    if (groupKey(coordsA) === groupKey(coordsB)) return true;
    return coordsWithinGroupMergeDistance(coordsA, coordsB);
}

function clusterPlacemarksByProximity(placemarks, itemsKey) {
    itemsKey = itemsKey || 'items';
    var groups = [];
    placemarks.forEach(function(obj) {
        var coords = obj.geometry.getCoordinates();
        var found = null;
        for (var i = 0; i < groups.length; i++) {
            if (coordsWithinGroupMergeDistance(coords, groups[i].coords)) {
                found = groups[i];
                break;
            }
        }
        if (found) {
            found[itemsKey].push(obj);
        } else {
            var g = { coords: coords.slice() };
            g[itemsKey] = [obj];
            groups.push(g);
        }
    });
    return groups;
}

function findNearestGroupMemberCoords(coords, objectType, excludeObj) {
    if (!coords || !objectType) return null;
    var best = null;
    var bestDist = Infinity;
    var scanList = objects;
    if (typeof MapPerf !== 'undefined' && MapPerf.querySpatialNearCoords) {
        var near = MapPerf.querySpatialNearCoords(coords, 2);
        if (near && (near.length || (typeof MapPerf.shouldUseViewportCull === 'function' && MapPerf.shouldUseViewportCull()))) {
            scanList = near;
        }
    }
    for (var i = 0; i < scanList.length; i++) {
        var obj = scanList[i];
        if (!obj || !obj.geometry || !obj.properties) continue;
        if (excludeObj && obj === excludeObj) continue;
        if (obj.properties.get('type') !== objectType) continue;
        var objCoords = obj.geometry.getCoordinates();
        if (!coordsWithinGroupMergeDistance(coords, objCoords)) continue;
        var dx = coords[0] - objCoords[0];
        var dy = coords[1] - objCoords[1];
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            best = objCoords;
        }
    }
    return best ? best.slice() : null;
}

function snapCoordsToObjectGroup(coords, objectType, excludeObj) {
    var anchor = findNearestGroupMemberCoords(coords, objectType, excludeObj);
    return anchor || coords;
}
function getCrossGroupName(coords) {
    return crossGroupNames.get(groupKey(coords)) || '';
}
function setCrossGroupName(coords, name) {
    const key = groupKey(coords);
    if (name && name.trim()) crossGroupNames.set(key, name.trim());
    else crossGroupNames.delete(key);
    saveGroupNames();
    updateCrossDisplay();
}
function getNodeGroupName(coords) {
    return nodeGroupNames.get(groupKey(coords)) || '';
}
function setNodeGroupName(coords, name) {
    const key = groupKey(coords);
    if (name && name.trim()) nodeGroupNames.set(key, name.trim());
    else nodeGroupNames.delete(key);
    saveGroupNames();
    updateNodeDisplay();
}
var GROUP_NAMES_STORAGE_KEY = 'networkmap_groupNames';
function saveGroupNames() {
    var payload = { cross: Object.fromEntries(crossGroupNames), node: Object.fromEntries(nodeGroupNames) };
    try {
        localStorage.setItem(GROUP_NAMES_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
    if (getApiBase()) {
        try {
            fetch(getApiBase() + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ groupNames: payload })
            }).catch(function() {});
        } catch (e) {}
    }
    if (typeof window.syncSendGroupNames === 'function' && window.syncIsConnected) {
        try { window.syncSendGroupNames(payload); } catch (e) {}
    }
}
function loadGroupNamesFromStorage() {
    try {
        var raw = localStorage.getItem(GROUP_NAMES_STORAGE_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            if (parsed.cross && typeof parsed.cross === 'object') Object.keys(parsed.cross).forEach(function(k) { crossGroupNames.set(k, parsed.cross[k]); });
            if (parsed.node && typeof parsed.node === 'object') Object.keys(parsed.node).forEach(function(k) { nodeGroupNames.set(k, parsed.node[k]); });
        }
    } catch (e) {}
}
window.getGroupNamesForSync = function() {
    if (typeof crossGroupNames === 'undefined' || typeof nodeGroupNames === 'undefined') return null;
    var cross = Object.fromEntries(crossGroupNames);
    var node = Object.fromEntries(nodeGroupNames);
    if (!Object.keys(cross).length && !Object.keys(node).length) return null;
    return { cross: cross, node: node };
};
window.applyGroupNames = function(gn) {
    if (!gn || typeof crossGroupNames === 'undefined' || typeof nodeGroupNames === 'undefined') return;
    try {
        if (gn.cross && typeof gn.cross === 'object') Object.keys(gn.cross).forEach(function(k) { crossGroupNames.set(k, gn.cross[k]); });
        if (gn.node && typeof gn.node === 'object') Object.keys(gn.node).forEach(function(k) { nodeGroupNames.set(k, gn.node[k]); });
        if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
        if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    } catch (e) {}
};
