/**
 * Stub for Portable: product news UI/API removed; keep identity sanitizer
 * so database helpers that still reference sanitizeNewsBody do not crash.
 */
'use strict';

function sanitizeNewsBody(html) {
    return String(html == null ? '' : html);
}

module.exports = { sanitizeNewsBody };
