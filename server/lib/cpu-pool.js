'use strict';

/**
 * Небольшой пул worker_threads для CPU-задач (stringify / clone),
 * чтобы не блокировать Express + WebSocket event loop.
 *
 * Размер: CPU_POOL_SIZE или min(4, max(1, floor(cpus/2))).
 * Отключить: CPU_POOL_SIZE=0
 */
const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

const WORKER_PATH = path.join(__dirname, 'cpu-worker.js');

function defaultPoolSize() {
    var cpus = 1;
    try {
        var list = os.cpus();
        if (list && list.length) cpus = list.length;
    } catch (e) {}
    return Math.max(1, Math.min(4, Math.floor(cpus / 2) || 1));
}

function parsePoolSize() {
    var raw = process.env.CPU_POOL_SIZE;
    if (raw == null || String(raw).trim() === '') return defaultPoolSize();
    var n = parseInt(String(raw).trim(), 10);
    if (!isFinite(n) || n < 0) return defaultPoolSize();
    return n;
}

var POOL_SIZE = parsePoolSize();
var nextId = 1;
var workers = [];
var idle = [];
var waitQueue = [];
var pending = new Map();
var destroyed = false;

function ensureWorkers() {
    if (destroyed || POOL_SIZE <= 0) return;
    while (workers.length < POOL_SIZE) {
        spawnOne();
    }
}

function spawnOne() {
    var worker = new Worker(WORKER_PATH);
    worker.__busy = false;
    worker.on('message', function (msg) {
        if (!msg || msg.id == null) return;
        var entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        worker.__busy = false;
        idle.push(worker);
        pump();
        if (msg.ok) entry.resolve(msg.result);
        else entry.reject(new Error(msg.error || 'cpu-worker failed'));
    });
    worker.on('error', function (err) {
        failBusyOrRecreate(worker, err);
    });
    worker.on('exit', function (code) {
        workers = workers.filter(function (w) { return w !== worker; });
        idle = idle.filter(function (w) { return w !== worker; });
        if (destroyed || POOL_SIZE <= 0) return;
        if (code !== 0) {
            console.error('[CPU] worker exited with code', code, '— restarting');
        }
        try { spawnOne(); } catch (e) {}
        pump();
    });
    workers.push(worker);
    idle.push(worker);
}

function failBusyOrRecreate(worker, err) {
    worker.__busy = false;
    pending.forEach(function (entry, id) {
        // Не знаем, какой id висел на этом worker — безопаснее не трогать чужие.
        void id;
        void entry;
    });
    console.error('[CPU] worker error:', err && err.message ? err.message : err);
}

function pump() {
    while (waitQueue.length && idle.length) {
        var job = waitQueue.shift();
        var worker = idle.pop();
        worker.__busy = true;
        pending.set(job.id, { resolve: job.resolve, reject: job.reject });
        try {
            worker.postMessage({ id: job.id, op: job.op, payload: job.payload });
        } catch (e) {
            pending.delete(job.id);
            worker.__busy = false;
            idle.push(worker);
            job.reject(e);
        }
    }
}

function run(op, payload) {
    if (destroyed || POOL_SIZE <= 0) {
        return Promise.reject(new Error('CPU pool disabled'));
    }
    ensureWorkers();
    return new Promise(function (resolve, reject) {
        var id = nextId++;
        waitQueue.push({ id: id, op: op, payload: payload, resolve: resolve, reject: reject });
        pump();
    });
}

function stringify(value, space) {
    if (POOL_SIZE <= 0) {
        return Promise.resolve(JSON.stringify(value, null, space != null ? space : 0));
    }
    return run('stringify', { value: value, space: space != null ? space : 0 });
}

function stringifyWrite(value, filePath, space) {
    if (POOL_SIZE <= 0) {
        var json = JSON.stringify(value, null, space != null ? space : 0);
        require('fs').writeFileSync(filePath, json, 'utf8');
        return Promise.resolve({ bytes: Buffer.byteLength(json, 'utf8') });
    }
    return run('stringifyWrite', {
        value: value,
        path: filePath,
        space: space != null ? space : 0
    });
}

function clone(value) {
    if (typeof structuredClone === 'function') {
        try {
            return Promise.resolve(structuredClone(value));
        } catch (e) {}
    }
    if (POOL_SIZE <= 0) {
        return Promise.resolve(JSON.parse(JSON.stringify(value)));
    }
    return run('clone', { value: value });
}

function deepCloneSync(value) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch (e) {}
    }
    return JSON.parse(JSON.stringify(value));
}

function isEnabled() {
    return POOL_SIZE > 0;
}

function size() {
    return POOL_SIZE;
}

function destroy() {
    destroyed = true;
    waitQueue.splice(0).forEach(function (job) {
        job.reject(new Error('CPU pool destroyed'));
    });
    pending.forEach(function (entry) {
        entry.reject(new Error('CPU pool destroyed'));
    });
    pending.clear();
    workers.forEach(function (w) {
        try { w.terminate(); } catch (e) {}
    });
    workers = [];
    idle = [];
}

if (POOL_SIZE > 0) {
    ensureWorkers();
    console.log('[CPU] worker pool:', POOL_SIZE, 'thread(s) (set CPU_POOL_SIZE to change, 0=off)');
}

module.exports = {
    run: run,
    stringify: stringify,
    stringifyWrite: stringifyWrite,
    clone: clone,
    deepCloneSync: deepCloneSync,
    isEnabled: isEnabled,
    size: size,
    destroy: destroy
};
