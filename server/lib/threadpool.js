'use strict';

/**
 * Число ядер и размер пула libuv (fs, crypto, zlib, argon2).
 * Подключать первой строкой точки входа: libuv читает UV_THREADPOOL_SIZE при первом использовании пула.
 */
const os = require('os');

function cpuCount() {
    try {
        if (typeof os.availableParallelism === 'function') {
            var n = os.availableParallelism();
            if (n > 0) return n;
        }
    } catch (e) {}
    try {
        var list = os.cpus();
        if (list && list.length) return list.length;
    } catch (e2) {}
    return 1;
}

if (process.env.UV_THREADPOOL_SIZE == null || String(process.env.UV_THREADPOOL_SIZE).trim() === '') {
    // libuv ограничивает пул 1024 потоками; меньше 4 (значение по умолчанию) не опускаемся.
    process.env.UV_THREADPOOL_SIZE = String(Math.min(1024, Math.max(4, cpuCount())));
}

module.exports = { cpuCount: cpuCount };
