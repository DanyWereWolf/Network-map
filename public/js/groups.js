/**
 * Группы кроссов и узлов.
 */
function groupKey(coords) {
    return coords[0].toFixed(5) + ',' + coords[1].toFixed(5);
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
