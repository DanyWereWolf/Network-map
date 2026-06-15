/**
 * uniqueId объектов, mapPerf.
 */
function getObjectUniqueId(obj) {
    if (!obj || !obj.properties) return null;
    let id = obj.properties.get('uniqueId');
    if (!id) {
        const type = obj.properties.get('type') || 'obj';
        id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        obj.properties.set('uniqueId', id);
    }
    if (typeof MapPerf !== 'undefined') MapPerf.registerMapObject(obj);
    return id;
}

function getMapObjectByUid(uid, typeFilter) {
    if (uid == null || uid === '') return null;
    if (typeof MapPerf !== 'undefined') {
        return MapPerf.getByUid(uid, typeFilter);
    }
    return objects.find(function(o) {
        if (!o || !o.properties || o.properties.get('uniqueId') !== uid) return false;
        return !typeFilter || o.properties.get('type') === typeFilter;
    }) || null;
}

function mapPerfRegister(obj) {
    if (typeof MapPerf !== 'undefined' && obj) MapPerf.registerMapObject(obj);
}

function mapPerfUnregister(obj) {
    if (typeof MapPerf !== 'undefined' && obj) MapPerf.unregisterMapObject(obj);
}

function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
