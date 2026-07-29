'use strict';

/**
 * Worker thread: тяжёлый JSON.stringify / запись файлов вне main event loop.
 */
const { parentPort } = require('worker_threads');
const fs = require('fs');

parentPort.on('message', function (msg) {
    if (!msg || typeof msg !== 'object') return;
    var id = msg.id;
    var op = msg.op;
    var payload = msg.payload || {};
    try {
        var result;
        if (op === 'stringify') {
            result = JSON.stringify(payload.value, null, payload.space != null ? payload.space : 0);
        } else if (op === 'stringifyWrite') {
            var json = JSON.stringify(payload.value, null, payload.space != null ? payload.space : 0);
            fs.writeFileSync(String(payload.path), json, 'utf8');
            result = { bytes: Buffer.byteLength(json, 'utf8') };
        } else if (op === 'clone') {
            // Значение уже скопировано при postMessage; возврат даёт ещё одну копию на main.
            result = payload.value;
        } else {
            throw new Error('Unknown cpu-worker op: ' + op);
        }
        parentPort.postMessage({ id: id, ok: true, result: result });
    } catch (e) {
        parentPort.postMessage({
            id: id,
            ok: false,
            error: e && e.message ? e.message : String(e)
        });
    }
});
