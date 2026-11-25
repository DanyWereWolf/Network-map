'use strict';

const crypto = require('crypto');

function generateShareToken() {
    return 'shr_' + crypto.randomBytes(24).toString('hex');
}

function normalizeShareLinks(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (l) { return l && typeof l === 'object' && l.token; });
}

function getOrgShareLinks(org) {
    if (!org) return [];
    return normalizeShareLinks(org.shareLinks);
}

function setOrgShareLinks(org, links) {
    if (!org) return;
    org.shareLinks = normalizeShareLinks(links);
}

function findShareLinkByToken(orgs, token) {
    if (!token || String(token).indexOf('shr_') !== 0) return null;
    var list = orgs || [];
    for (var i = 0; i < list.length; i++) {
        var org = list[i];
        if (!org || (org.status && org.status !== 'active')) continue;
        var links = getOrgShareLinks(org);
        for (var j = 0; j < links.length; j++) {
            var link = links[j];
            if (!link || link.token !== token) continue;
            if (link.revoked) continue;
            if (link.expiresAt) {
                var exp = Date.parse(link.expiresAt);
                if (!isNaN(exp) && exp <= Date.now()) continue;
            }
            return { organization: org, link: link };
        }
    }
    return null;
}

function createShareLink(org, opts) {
    opts = opts || {};
    var ttlMs = opts.ttlMs != null ? Number(opts.ttlMs) : (7 * 24 * 60 * 60 * 1000);
    if (isNaN(ttlMs) || ttlMs < 60 * 1000) ttlMs = 7 * 24 * 60 * 60 * 1000;
    var expiresAt = opts.expiresAt
        ? new Date(opts.expiresAt).toISOString()
        : new Date(Date.now() + ttlMs).toISOString();
    var link = {
        id: 'shl_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
        token: generateShareToken(),
        label: opts.label ? String(opts.label).trim().slice(0, 120) : '',
        regionId: opts.regionId != null && opts.regionId !== '' ? String(opts.regionId) : null,
        center: Array.isArray(opts.center) && opts.center.length >= 2 ? [Number(opts.center[0]), Number(opts.center[1])] : null,
        zoom: opts.zoom != null && !isNaN(Number(opts.zoom)) ? Number(opts.zoom) : null,
        expiresAt: expiresAt,
        revoked: false,
        createdBy: opts.createdBy || null,
        createdAt: new Date().toISOString()
    };
    var links = getOrgShareLinks(org);
    links.push(link);
    setOrgShareLinks(org, links);
    return link;
}

function revokeShareLink(org, linkId) {
    var links = getOrgShareLinks(org);
    var found = false;
    for (var i = 0; i < links.length; i++) {
        if (String(links[i].id) === String(linkId) || String(links[i].token) === String(linkId)) {
            links[i].revoked = true;
            found = true;
            break;
        }
    }
    if (found) setOrgShareLinks(org, links);
    return found;
}

function publicShareLinkView(link) {
    if (!link) return null;
    return {
        id: link.id,
        label: link.label || '',
        regionId: link.regionId || null,
        center: link.center || null,
        zoom: link.zoom != null ? link.zoom : null,
        expiresAt: link.expiresAt || null,
        revoked: !!link.revoked,
        createdAt: link.createdAt || null,
        createdBy: link.createdBy || null,
        token: link.token
    };
}

module.exports = {
    generateShareToken: generateShareToken,
    getOrgShareLinks: getOrgShareLinks,
    setOrgShareLinks: setOrgShareLinks,
    findShareLinkByToken: findShareLinkByToken,
    createShareLink: createShareLink,
    revokeShareLink: revokeShareLink,
    publicShareLinkView: publicShareLinkView
};
