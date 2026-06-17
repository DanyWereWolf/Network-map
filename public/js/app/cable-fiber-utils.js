/**
 * Жилы кабеля: usedFibers, группы, связанные кабели.
 */
function removeCableFromUsedFibers(obj, cableUniqueId) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (usedFibersData && usedFibersData[cableUniqueId]) {
        delete usedFibersData[cableUniqueId];
        obj.properties.set('usedFibers', usedFibersData);
        saveData();
    }
}

async function changeCableType(cableUniqueId, newValue) {
    var count = parseInt(newValue, 10);
    if (isNaN(count)) count = getFiberCount(newValue);
    return updateCableFiberSettings(cableUniqueId, count, undefined);
}

function getFiberCount(arg) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getFiberCount(arg);
    if (arg === 'copper') return 1;
    return 0;
}

/** Кабели через опору или крепление: концы маршрута (from/to) или промежуточная точка (points / геометрия). */
function getCablesThroughSupport(supportObj) {
    if (!supportObj || !supportObj.geometry) return [];
    var supportCoords = supportObj.geometry.getCoordinates();
    if (!supportCoords || supportCoords.length < 2) return [];
    var supportId = getObjectUniqueId(supportObj);
    var tol = 1e-6;
    function coordsMatch(a, b) {
        if (!a || !b || a.length < 2 || b.length < 2) return false;
        return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
    }
    var direct = objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === supportObj || to === supportObj) return true;
        if (from && getObjectUniqueId(from) === supportId) return true;
        if (to && getObjectUniqueId(to) === supportId) return true;
        var points = cable.properties.get('points');
        if (Array.isArray(points) && points.some(function(p) { return p === supportObj || (p && getObjectUniqueId(p) === supportId); })) return true;
        var geom = cable.geometry && cable.geometry.getCoordinates && cable.geometry.getCoordinates();
        if (!geom || !Array.isArray(geom)) return false;
        return geom.some(function(c) { return coordsMatch(c, supportCoords); });
    });
    direct = direct.slice().sort(function(a, b) {
        var idA = a.properties && a.properties.get('uniqueId');
        var idB = b.properties && b.properties.get('uniqueId');
        return (idA || '').localeCompare(idB || '', undefined, { numeric: true });
    });
    return direct;
}

function getConnectedCables(obj) {
    var objUid = obj && obj.properties ? getObjectUniqueId(obj) : null;
    var direct = objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === obj || to === obj) return true;
        if (!objUid) return false;
        return (from && getObjectUniqueId(from) === objUid) || (to && getObjectUniqueId(to) === objUid);
    });
    // Стабильная сортировка по uniqueId кабеля, чтобы порядок не «прыгал» при обновлении (опоры, муфта, кросс)
    direct = direct.slice().sort(function(a, b) {
        var idA = a.properties && a.properties.get('uniqueId');
        var idB = b.properties && b.properties.get('uniqueId');
        if (!idA) idA = '';
        if (!idB) idB = '';
        return (idA || '').localeCompare(idB || '', undefined, { numeric: true });
    });
    return direct;
}

function getOtherEndOfCable(cable, oneEnd) {
    if (!cable || !oneEnd) return null;
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    if (fromObj === oneEnd) return toObj;
    if (toObj === oneEnd) return fromObj;
    const oneId = getObjectUniqueId(oneEnd);
    if (fromObj && getObjectUniqueId(fromObj) === oneId) return toObj;
    if (toObj && getObjectUniqueId(toObj) === oneId) return fromObj;
    return null;
}

function crossHasFiberForConnection(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    const cables = getConnectedCables(crossObj);
    const cable = cables.find(c => c.properties && c.properties.get('uniqueId') === cableId);
    if (!cable) return false;
    const n = getFiberCount(cable);
    return fiberNumber >= 1 && fiberNumber <= n;
}

function isFiberSplicedAtHost(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    const fiberConnections = hostObj.properties.get('fiberConnections') || [];
    return fiberConnections.some(function(conn) {
        return (conn.from && conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
            (conn.to && conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber);
    });
}

function getTotalUsedPortsInCross(crossObj) {
    if (!crossObj || !crossObj.properties || !isCrossLikeHostType(crossObj.properties.get('type'))) {
        return 0;
    }
    const fiberPorts = crossObj.properties.get('fiberPorts') || {};
    const usedPortNums = new Set();
    Object.keys(fiberPorts).forEach(function(key) {
        const lastDash = key.lastIndexOf('-');
        if (lastDash < 0) return;
        const cableId = key.substring(0, lastDash);
        const fiberNumber = parseInt(key.substring(lastDash + 1), 10);
        if (isFiberSplicedAtHost(crossObj, cableId, fiberNumber)) return;
        const port = parseInt(fiberPorts[key], 10);
        if (!isNaN(port) && port > 0) usedPortNums.add(port);
    });
    return usedPortNums.size;
}

function getTotalUsedFibersInSleeve(sleeveObj) {
    if (!sleeveObj || !sleeveObj.properties || sleeveObj.properties.get('type') !== 'sleeve') {
        return 0;
    }

    let totalFibers = 0;
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');

            if ((fromObj && fromObj === sleeveObj) || (toObj && toObj === sleeveObj)) {
                const cableType = obj.properties.get('cableType');
                const fiberCount = getFiberCount(cableType);
                totalFibers += fiberCount;
            }
        }
    });
    
    return totalFibers;
}

