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
    }
}

function readCableSplitSleeveOptions(container) {
    var root = container && container.querySelector ? container : document;
    var block = root.querySelector ? root.querySelector('.cable-split-sleeve-fields') : null;
    var sleeveType = 'SNR-FOSC-L';
    var sleeveName = '';
    if (!block) return { sleeveType: sleeveType, sleeveName: sleeveName, maxFibers: 0 };
    var typeEl = block.querySelector('.cable-split-sleeve-type');
    var nameEl = block.querySelector('.cable-split-sleeve-name');
    if (typeEl && typeEl.value) sleeveType = typeEl.value;
    if (nameEl && nameEl.value) sleeveName = String(nameEl.value).trim();
    return { sleeveType: sleeveType, sleeveName: sleeveName, maxFibers: 0 };
}

function mergeCableSplitSleeveOptions(splitBase, sleeveOpts) {
    var out = Object.assign({}, splitBase || {});
    if (!sleeveOpts) return out;
    if (sleeveOpts.sleeveType) out.sleeveType = sleeveOpts.sleeveType;
    if (sleeveOpts.sleeveName) out.sleeveName = sleeveOpts.sleeveName;
    out.maxFibers = 0;
    return out;
}
