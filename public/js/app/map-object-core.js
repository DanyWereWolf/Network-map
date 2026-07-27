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

function getFiberHostByUid(uid) {
    return getMapObjectByUid(uid, 'cross')
        || getMapObjectByUid(uid, 'spliceCassette')
        || getMapObjectByUid(uid, 'sleeve')
        || getMapObjectByUid(uid, 'cabinet');
}

function mapPerfRegister(obj) {
    if (typeof MapPerf !== 'undefined' && obj) MapPerf.registerMapObject(obj);
    disableNativePlacemarkBalloon(obj);
}

/** Нативные balloon Яндекс.Карт не используем — инфо через модалки/подписи. */
function disableNativePlacemarkBalloon(obj) {
    if (!obj || !obj.options) return;
    try {
        obj.options.set({ hasBalloon: false, openBalloonOnClick: false });
    } catch (e) {}
    if (obj.properties) {
        try {
            if (obj.properties.get('balloonContent') != null) obj.properties.unset('balloonContent');
        } catch (e2) {
            try { obj.properties.set('balloonContent', ''); } catch (e3) {}
        }
    }
}

function mapPerfUnregister(obj) {
    if (typeof MapPerf !== 'undefined' && obj) MapPerf.unregisterMapObject(obj);
}

function mapGeoAdd(obj) {
    if (!obj) return;
    if (typeof MapPerf !== 'undefined' && MapPerf.mapAdd) MapPerf.mapAdd(obj);
    else if (myMap) try { myMap.geoObjects.add(obj); } catch (e) {}
}

function mapGeoRemove(obj, force) {
    if (!obj) return;
    if (typeof MapPerf !== 'undefined' && MapPerf.mapRemove) MapPerf.mapRemove(obj, force);
    else if (myMap) try { myMap.geoObjects.remove(obj); } catch (e) {}
}

function mapGeoPin(obj) {
    if (typeof MapPerf !== 'undefined' && MapPerf.pinObject && obj) MapPerf.pinObject(obj);
    else mapGeoAdd(obj);
}

function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
