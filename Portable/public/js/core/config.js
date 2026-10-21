const APP_VERSION = '1.2.0';
var API_BASE = '';

function getApiBase() {
    if (typeof API_BASE !== 'undefined' && API_BASE && String(API_BASE).trim() !== '') return String(API_BASE).trim();
    var o = typeof window !== 'undefined' && window.location && window.location.origin;
    return (o && (o.indexOf('http://') === 0 || o.indexOf('https://') === 0)) ? o : '';
}
