const APP_VERSION = '1.0.4';
const GITHUB_REPO = { owner: 'DanyWereWolf', repo: 'Network-map' };

var lastUpdateCheckResult = null;

var API_BASE = '';

function getApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE && String(API_BASE).trim() !== '') return String(API_BASE).trim();
    var o = typeof window !== 'undefined' && window.location && window.location.origin;
    return (o && (o.indexOf('http://') === 0 || o.indexOf('https://') === 0)) ? o : '';
}
