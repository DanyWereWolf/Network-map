/** Первичная настройка Portable: название организации и расположение карты. */
(function() {
    var SETUP_MAP_DEFAULT = { center: [54.663609, 86.162243], zoom: 15 };
    var setupMapInstance = null;
    var setupMapPlacemark = null;
    var setupMapSyncFromPan = false;
    var setupBusy = false;

    function whenYmapsReady(cb) {
        if (typeof MapEngine !== 'undefined' && MapEngine.whenReady) {
            MapEngine.whenReady(cb);
            return;
        }
        if (window.ymaps) { window.ymaps.ready(cb); return; }
        var attempts = 0;
        var timer = setInterval(function() {
            attempts++;
            if (window.ymaps) {
                clearInterval(timer);
                window.ymaps.ready(cb);
            } else if (attempts > 100) {
                clearInterval(timer);
            }
        }, 100);
    }

    function normalizeMapCoords(center) {
        if (!center) return null;
        var lat = Array.isArray(center) ? center[0] : (center.lat != null ? (typeof center.lat === 'function' ? center.lat() : center.lat) : center[0]);
        var lon = Array.isArray(center) ? center[1] : (center.lng != null ? (typeof center.lng === 'function' ? center.lng() : center.lng) : center[1]);
        lat = Number(lat);
        lon = Number(lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        return [lat, lon];
    }

    function setSetupMapCoords(coords, zoom) {
        var normalized = normalizeMapCoords(coords);
        if (!normalized) return;
        var latEl = document.getElementById('portableSetupMapLat');
        var lonEl = document.getElementById('portableSetupMapLon');
        var zoomEl = document.getElementById('portableSetupMapZoom');
        var labelEl = document.getElementById('portableSetupMapCoordsLabel');
        if (latEl) latEl.value = String(normalized[0]);
        if (lonEl) lonEl.value = String(normalized[1]);
        if (zoomEl && typeof zoom === 'number' && Number.isFinite(zoom)) {
            zoomEl.value = String(Math.max(1, Math.min(21, Math.round(zoom))));
        }
        if (labelEl) labelEl.textContent = normalized[0].toFixed(5) + ', ' + normalized[1].toFixed(5);
    }

    function getSetupMapStart() {
        if (setupMapInstance) {
            var coords = normalizeMapCoords(setupMapInstance.getCenter());
            var zoom = setupMapInstance.getZoom();
            if (coords) {
                setSetupMapCoords(coords, zoom);
                return {
                    center: coords,
                    zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? Math.max(1, Math.min(21, zoom)) : 15
                };
            }
        }
        var lat = parseFloat(document.getElementById('portableSetupMapLat') && document.getElementById('portableSetupMapLat').value);
        var lon = parseFloat(document.getElementById('portableSetupMapLon') && document.getElementById('portableSetupMapLon').value);
        var zoomVal = parseInt(document.getElementById('portableSetupMapZoom') && document.getElementById('portableSetupMapZoom').value, 10);
        var coordsFromInput = normalizeMapCoords([lat, lon]);
        if (!coordsFromInput) coordsFromInput = SETUP_MAP_DEFAULT.center.slice();
        return {
            center: coordsFromInput,
            zoom: Number.isFinite(zoomVal) && zoomVal >= 1 && zoomVal <= 21 ? zoomVal : SETUP_MAP_DEFAULT.zoom
        };
    }

    function destroySetupMapPicker() {
        if (setupMapInstance) {
            try { setupMapInstance.destroy(); } catch (e) {}
            setupMapInstance = null;
            setupMapPlacemark = null;
        }
    }

    function initSetupMapPicker(initial) {
        var container = document.getElementById('portableSetupMapPicker');
        if (!container) return;
        var startCenter = (initial && initial.center) ? initial.center : SETUP_MAP_DEFAULT.center;
        var startZoom = (initial && initial.zoom) ? initial.zoom : SETUP_MAP_DEFAULT.zoom;
        setSetupMapCoords(startCenter, startZoom);
        whenYmapsReady(function() {
            if (!document.getElementById('portableSetupMapPicker') || setupMapInstance) return;
            var start = getSetupMapStart();
            setupMapInstance = new ymaps.Map('portableSetupMapPicker', {
                center: start.center,
                zoom: start.zoom,
                controls: ['zoomControl', 'searchControl']
            });
            try { setupMapInstance.behaviors.disable('scrollZoom'); } catch (e) {}
            setupMapPlacemark = new ymaps.Placemark(start.center, {}, {
                preset: 'islands#blueCircleDotIcon',
                draggable: true
            });
            setupMapInstance.geoObjects.add(setupMapPlacemark);
            setupMapPlacemark.events.add('dragend', function() {
                setupMapSyncFromPan = true;
                var coords = normalizeMapCoords(setupMapPlacemark.geometry.getCoordinates());
                if (coords) {
                    setSetupMapCoords(coords, setupMapInstance.getZoom());
                    setupMapInstance.setCenter(coords, setupMapInstance.getZoom(), { duration: 200 });
                }
                setTimeout(function() { setupMapSyncFromPan = false; }, 300);
            });
            setupMapInstance.events.add('click', function(e) {
                var coords = normalizeMapCoords(e.get('coords'));
                if (!coords) return;
                setupMapPlacemark.geometry.setCoordinates(coords);
                setSetupMapCoords(coords, setupMapInstance.getZoom());
            });
            setupMapInstance.events.add('boundschange', function() {
                if (setupMapSyncFromPan) return;
                var coords = normalizeMapCoords(setupMapInstance.getCenter());
                if (coords) {
                    if (setupMapPlacemark) setupMapPlacemark.geometry.setCoordinates(coords);
                    setSetupMapCoords(coords, setupMapInstance.getZoom());
                }
            });
            setTimeout(function() {
                try { setupMapInstance.container.fitToViewport(); } catch (eFit) {}
            }, 80);
        });
    }

    function closePortableSetupModal() {
        var modal = document.getElementById('portableSetupModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.classList.remove('modal--centered');
        modal.setAttribute('aria-hidden', 'true');
        destroySetupMapPicker();
    }

    function showPortableSetupModal(prefill) {
        var modal = document.getElementById('portableSetupModal');
        if (!modal) return;
        var nameEl = document.getElementById('portableSetupOrgName');
        var errEl = document.getElementById('portableSetupError');
        if (nameEl) nameEl.value = (prefill && prefill.organizationName) ? prefill.organizationName : '';
        if (errEl) {
            errEl.textContent = '';
            errEl.hidden = true;
        }
        modal.style.display = 'flex';
        modal.classList.add('modal--centered');
        modal.setAttribute('aria-hidden', 'false');
        destroySetupMapPicker();
        initSetupMapPicker(prefill && prefill.mapStart ? prefill.mapStart : null);
        setTimeout(function() {
            if (nameEl) nameEl.focus();
        }, 60);
    }

    function submitPortableSetup() {
        if (setupBusy) return;
        var nameEl = document.getElementById('portableSetupOrgName');
        var errEl = document.getElementById('portableSetupError');
        var name = nameEl ? String(nameEl.value || '').trim() : '';
        if (name.length < 2) {
            if (errEl) {
                errEl.textContent = 'Укажите название организации';
                errEl.hidden = false;
            }
            if (nameEl) nameEl.focus();
            return;
        }
        var mapStart = getSetupMapStart();
        if (!mapStart || !mapStart.center) {
            if (errEl) {
                errEl.textContent = 'Укажите расположение карты';
                errEl.hidden = false;
            }
            return;
        }
        if (typeof getApiBase !== 'function' || !getApiBase() || typeof getAuthToken !== 'function' || !getAuthToken()) {
            if (errEl) {
                errEl.textContent = 'Нет соединения с сервером';
                errEl.hidden = false;
            }
            return;
        }
        setupBusy = true;
        var saveBtn = document.getElementById('portableSetupSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Сохранение…';
        }
        if (errEl) errEl.hidden = true;

        fetch(getApiBase() + '/api/portable/setup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': 'Bearer ' + getAuthToken()
            },
            body: JSON.stringify({
                organizationName: name,
                mapStart: mapStart
            })
        }).then(function(r) {
            return r.json().then(function(body) {
                if (!r.ok) throw new Error((body && body.error) || 'Не удалось сохранить');
                return body;
            });
        }).then(function(body) {
            if (body && body.mapStart && typeof applyMapStartFromSettings === 'function') {
                window._savedMapStart = body.mapStart;
                applyMapStartFromSettings(body.mapStart, true);
            }
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.organization) {
                currentUser.organization.name = name;
            }
            try {
                var profileOrg = document.getElementById('profileOrgName');
                if (profileOrg) profileOrg.textContent = name;
            } catch (eProf) {}
            closePortableSetupModal();
            if (typeof showInfo === 'function') {
                showInfo('Настройки сохранены. Карта будет открываться здесь у всей команды.', 'Готово');
            }
            if (typeof initWelcomeModal === 'function') {
                setTimeout(function() { initWelcomeModal(); }, 180);
            }
        }).catch(function(err) {
            if (errEl) {
                errEl.textContent = (err && err.message) ? err.message : 'Не удалось сохранить';
                errEl.hidden = false;
            }
        }).finally(function() {
            setupBusy = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Сохранить и продолжить';
            }
        });
    }

    function bindPortableSetupModal() {
        var modal = document.getElementById('portableSetupModal');
        if (!modal || modal._portableSetupBound) return;
        modal._portableSetupBound = true;
        var saveBtn = document.getElementById('portableSetupSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', submitPortableSetup);
        var geoBtn = document.getElementById('portableSetupGeolocateBtn');
        if (geoBtn) {
            geoBtn.addEventListener('click', function() {
                if (!navigator.geolocation) return;
                geoBtn.disabled = true;
                navigator.geolocation.getCurrentPosition(function(pos) {
                    geoBtn.disabled = false;
                    var coords = [pos.coords.latitude, pos.coords.longitude];
                    setSetupMapCoords(coords, 15);
                    if (setupMapInstance) {
                        setupMapInstance.setCenter(coords, 15, { duration: 300 });
                        if (setupMapPlacemark) setupMapPlacemark.geometry.setCoordinates(coords);
                    }
                }, function() {
                    geoBtn.disabled = false;
                }, { enableHighAccuracy: true, timeout: 10000 });
            });
        }
        var nameEl = document.getElementById('portableSetupOrgName');
        if (nameEl) {
            nameEl.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitPortableSetup();
                }
            });
        }
    }

    function maybeShowPortableSetup(done) {
        bindPortableSetupModal();
        var finish = typeof done === 'function' ? done : function() {};
        if (window.VolsmapEmbed && VolsmapEmbed.isEmbed && VolsmapEmbed.isEmbed()) {
            finish(false);
            return;
        }
        if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') {
            finish(false);
            return;
        }
        if (typeof getApiBase !== 'function' || !getApiBase() || typeof getAuthToken !== 'function' || !getAuthToken()) {
            finish(false);
            return;
        }
        fetch(getApiBase() + '/api/portable/setup', {
            headers: { 'Authorization': 'Bearer ' + getAuthToken() }
        }).then(function(r) {
            if (!r.ok) throw new Error('setup status');
            return r.json();
        }).then(function(data) {
            if (data && data.needed) {
                showPortableSetupModal(data);
                finish(true);
            } else {
                finish(false);
            }
        }).catch(function() {
            finish(false);
        });
    }

    window.maybeShowPortableSetup = maybeShowPortableSetup;
    window.closePortableSetupModal = closePortableSetupModal;
})();
