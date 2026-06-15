/**
 * Поля выбора муфты при разрезе кабеля.
 */
/** Поля выбора типа муфты при разрезе кабеля (опора / линия кабеля). */
function buildCableSplitSleeveFieldsHtml(selectedType) {
    var sel = selectedType || 'SNR-FOSC-L';
    var html = '<div class="cable-split-sleeve-fields">';
    html += '<div class="form-group cable-split-sleeve-fields__type">';
    html += '<label class="cable-split-sleeve-fields__label">Тип муфты</label>';
    html += '<select class="form-select cable-split-sleeve-type">' + getSleeveTypeSelectOptionsHtml(sel) + '</select>';
    html += '</div>';
    html += '<div class="form-group cable-split-sleeve-fields__name">';
    html += '<label class="cable-split-sleeve-fields__label">Название муфты</label>';
    html += '<input type="text" class="form-input cable-split-sleeve-name" placeholder="Необязательно">';
    html += '</div>';
    html += '<div class="form-group cable-split-sleeve-max-wrap" style="display: none;">';
    html += '<label class="cable-split-sleeve-fields__label">Макс. волокон</label>';
    html += '<input type="number" class="form-input cable-split-sleeve-max" min="0" max="288" value="0">';
    html += '<small class="cable-split-sleeve-fields__hint">0 — без лимита</small>';
    html += '</div>';
    html += '</div>';
    return html;
}

function bindCableSplitSleeveFields(container) {
    var root = container && container.querySelector ? container : document;
    var blocks = root.querySelectorAll ? root.querySelectorAll('.cable-split-sleeve-fields') : [];
    for (var bi = 0; bi < blocks.length; bi++) {
        var block = blocks[bi];
        if (block._cableSplitSleeveBound) continue;
        block._cableSplitSleeveBound = true;
        var typeEl = block.querySelector('.cable-split-sleeve-type');
        var maxWrap = block.querySelector('.cable-split-sleeve-max-wrap');
        var maxInput = block.querySelector('.cable-split-sleeve-max');
        if (!typeEl) continue;
        function syncMaxFibersField() {
            var t = typeEl.value;
            if (t === 'custom') {
                if (maxWrap) maxWrap.style.display = '';
                if (maxInput && (!maxInput.value || maxInput.value === '0')) maxInput.value = '96';
            } else {
                if (maxWrap) maxWrap.style.display = 'none';
                if (maxInput) maxInput.value = String(getDefaultMaxFibersForSleeveType(t));
            }
        }
        typeEl.addEventListener('change', syncMaxFibersField);
        syncMaxFibersField();
    }
}

function readCableSplitSleeveOptions(container) {
    var root = container && container.querySelector ? container : document;
    var block = root.querySelector ? root.querySelector('.cable-split-sleeve-fields') : null;
    var sleeveType = 'SNR-FOSC-L';
    var sleeveName = '';
    var maxFibers = getDefaultMaxFibersForSleeveType(sleeveType);
    if (!block) return { sleeveType: sleeveType, sleeveName: sleeveName, maxFibers: maxFibers };
    var typeEl = block.querySelector('.cable-split-sleeve-type');
    var nameEl = block.querySelector('.cable-split-sleeve-name');
    var maxEl = block.querySelector('.cable-split-sleeve-max');
    if (typeEl && typeEl.value) sleeveType = typeEl.value;
    if (nameEl && nameEl.value) sleeveName = String(nameEl.value).trim();
    if (sleeveType === 'custom') {
        maxFibers = maxEl ? parseInt(maxEl.value, 10) : 0;
        if (isNaN(maxFibers)) maxFibers = 0;
    } else {
        maxFibers = getDefaultMaxFibersForSleeveType(sleeveType);
    }
    return { sleeveType: sleeveType, sleeveName: sleeveName, maxFibers: maxFibers };
}

function mergeCableSplitSleeveOptions(splitBase, sleeveOpts) {
    var out = Object.assign({}, splitBase || {});
    if (!sleeveOpts) return out;
    if (sleeveOpts.sleeveType) out.sleeveType = sleeveOpts.sleeveType;
    if (sleeveOpts.sleeveName) out.sleeveName = sleeveOpts.sleeveName;
    if (sleeveOpts.maxFibers !== undefined && sleeveOpts.maxFibers !== null) out.maxFibers = sleeveOpts.maxFibers;
    return out;
}
