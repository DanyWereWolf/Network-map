'use strict';

function sanitizeNewsBody(html) {
    return String(html == null ? '' : html);
}

module.exports = { sanitizeNewsBody };
