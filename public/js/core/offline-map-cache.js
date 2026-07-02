/**
 * Офлайн-кэш карты организации (IndexedDB / нативное хранилище Android).
 */
(function(global) {
    'use strict';

    var DB_NAME = 'volsmap_offline_v1';
    var STORE_NAME = 'map_snapshots';
    var SAVE_DEBOUNCE_MS = 2500;
    var saveTimer = null;

    function isAndroidNative() {
        try {
            return global.VolsmapNative && typeof global.VolsmapNative.saveMapCache === 'function';
        } catch (e) {
            return false;
        }
    }

    function getOrgId() {
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null) {
                return String(currentUser.organizationId);
            }
            if (global._mapOrgIdLoaded != null) return String(global._mapOrgIdLoaded);
        } catch (e) {}
        return '';
    }

    function openDb() {
        return new Promise(function(resolve, reject) {
            if (!global.indexedDB) {
                reject(new Error('indexedDB unavailable'));
                return;
            }
            var req = global.indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function() {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'orgId' });
                }
            };
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error || new Error('indexedDB open failed')); };
        });
    }

    function buildSnapshot() {
        if (typeof getSerializedData !== 'function') return null;
        var orgId = getOrgId();
        if (!orgId) return null;
        var data;
        try {
            data = getSerializedData();
        } catch (e) {
            return null;
        }
        if (!Array.isArray(data)) return null;
        return {
            orgId: orgId,
            organizationId: orgId,
            savedAt: new Date().toISOString(),
            data: data,
            mapStart: global._savedMapStart || null
        };
    }

    function saveSnapshot(snapshot) {
        if (!snapshot || !snapshot.orgId || !Array.isArray(snapshot.data)) {
            return Promise.resolve(false);
        }
        var json = JSON.stringify(snapshot);
        if (isAndroidNative()) {
            try {
                global.VolsmapNative.saveMapCache(json);
                return Promise.resolve(true);
            } catch (e) {
                return Promise.resolve(false);
            }
        }
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(snapshot);
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { reject(tx.error); };
            });
        }).catch(function() { return false; });
    }

    function readSnapshot(orgId) {
        if (!orgId) return Promise.resolve(null);
        if (isAndroidNative()) {
            try {
                var raw = global.VolsmapNative.getMapCache();
                if (!raw) return Promise.resolve(null);
                var parsed = JSON.parse(raw);
                if (!parsed || String(parsed.orgId) !== String(orgId)) return Promise.resolve(null);
                return Promise.resolve(parsed);
            } catch (e) {
                return Promise.resolve(null);
            }
        }
        return openDb().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var req = tx.objectStore(STORE_NAME).get(String(orgId));
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { reject(req.error); };
            });
        }).catch(function() { return null; });
    }

    function showOfflineBanner(savedAt) {
        var id = 'volsmapOfflineMapBanner';
        var el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'volsmap-offline-map-banner';
            el.setAttribute('role', 'status');
            var header = document.querySelector('.top-header');
            if (header && header.parentNode) {
                header.parentNode.insertBefore(el, header.nextSibling);
            } else {
                document.body.appendChild(el);
            }
        }
        var when = '';
        try {
            when = savedAt ? new Date(savedAt).toLocaleString('ru-RU') : '';
        } catch (e) {}
        el.textContent = when
            ? 'Офлайн — показана сохранённая копия карты от ' + when
            : 'Офлайн — показана сохранённая копия карты';
        el.style.display = 'block';
    }

    function hideOfflineBanner() {
        var el = document.getElementById('volsmapOfflineMapBanner');
        if (el) el.style.display = 'none';
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function() {
            saveTimer = null;
            var snapshot = buildSnapshot();
            if (!snapshot || !snapshot.data.length) return;
            saveSnapshot(snapshot);
        }, SAVE_DEBOUNCE_MS);
    }

    function tryRestoreAndApply() {
        var orgId = getOrgId();
        if (!orgId) return Promise.resolve(false);
        return readSnapshot(orgId).then(function(snapshot) {
            if (!snapshot || !Array.isArray(snapshot.data) || !snapshot.data.length) return false;
            if (typeof applyRemoteState === 'function') {
                if (snapshot.mapStart) global._savedMapStart = snapshot.mapStart;
                applyRemoteState(snapshot.data, {
                    fromCache: true,
                    organizationId: snapshot.organizationId || snapshot.orgId,
                    offline: true
                });
            }
            global._volsmapOfflineMapActive = true;
            showOfflineBanner(snapshot.savedAt);
            return true;
        });
    }

    function clearForOrg(orgId) {
        if (!orgId) return Promise.resolve();
        if (isAndroidNative()) {
            try { global.VolsmapNative.clearMapCache(); } catch (e) {}
        }
        return openDb().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(String(orgId));
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); };
            });
        }).catch(function() {});
    }

    global.OfflineMapCache = {
        scheduleSave: scheduleSave,
        tryRestoreAndApply: tryRestoreAndApply,
        clearForOrg: clearForOrg,
        hideOfflineBanner: hideOfflineBanner
    };

    global.addEventListener('online', function() {
        hideOfflineBanner();
        global._volsmapOfflineMapActive = false;
    });

    if (global.navigator && global.navigator.onLine === false) {
        global.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() { tryRestoreAndApply(); }, 800);
        });
    }
})(typeof window !== 'undefined' ? window : this);
