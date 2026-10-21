/**
 * Выдача офлайн-лицензии Portable тем же keypair, которым собирается zip.
 * Нужно, чтобы подпись совпадала с EMBEDDED_PUBLIC_KEY в клиентской сборке.
 *
 *   node scripts/issue-portable-license.js --customer "ООО Ромашка" --machine "A7F3-..." [--note "..."]
 *   node scripts/issue-portable-license.js --pubkey
 *   node scripts/issue-portable-license.js --verify path/to/license.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_KEYPAIR = path.join(REPO_ROOT, 'data', 'portable-license-keypair.json');
const cryptoLib = require(path.join(REPO_ROOT, 'server', 'lib', 'portable-license-crypto.js'));

function fail(msg) {
    console.error('[license]', msg);
    process.exit(1);
}

function parseArgs(argv) {
    var out = { customer: '', machine: '', note: '', keypair: '', verify: '', pubkey: false };
    for (var i = 0; i < argv.length; i++) {
        var a = argv[i];
        if (a === '--pubkey') out.pubkey = true;
        else if (a === '--customer' && argv[i + 1]) out.customer = argv[++i];
        else if (a === '--machine' && argv[i + 1]) out.machine = argv[++i];
        else if (a === '--note' && argv[i + 1]) out.note = argv[++i];
        else if (a === '--keypair' && argv[i + 1]) out.keypair = argv[++i];
        else if (a === '--verify' && argv[i + 1]) out.verify = argv[++i];
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function resolveKeypair(cliPath) {
    if (cliPath) return path.resolve(cliPath);
    if (fs.existsSync(DEFAULT_KEYPAIR)) return DEFAULT_KEYPAIR;
    fail('Нет keypair: ' + DEFAULT_KEYPAIR + '\nСоберите Portable (npm run release в Portable/) или скопируйте файл с сервера выдачи.');
}

function loadKeypair(keypairPath) {
    var kp = cryptoLib.loadKeypair(keypairPath);
    if (!kp) {
        kp = cryptoLib.ensureKeypair(keypairPath);
    }
    return kp;
}

function main() {
    var opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        console.log([
            'Выдача лицензии Portable (Ed25519) ключом из data/portable-license-keypair.json',
            '',
            '  node scripts/issue-portable-license.js --customer "Клиент" --machine "КОД" [--note "..."]',
            '  node scripts/issue-portable-license.js --pubkey',
            '  node scripts/issue-portable-license.js --verify license.json',
            '',
            'Важно: этот keypair должен совпадать с файлом на сервере site-admin',
            'и с тем, которым делали npm run release для zip клиента.'
        ].join('\n'));
        return;
    }

    var keypairPath = resolveKeypair(opts.keypair);
    var kp = loadKeypair(keypairPath);

    if (opts.pubkey) {
        console.log(kp.publicKey);
        console.log('# keypair:', keypairPath);
        if (kp.createdAt) console.log('# createdAt:', kp.createdAt);
        return;
    }

    if (opts.verify) {
        var raw = fs.readFileSync(path.resolve(opts.verify), 'utf8');
        var doc = cryptoLib.parseLicenseInput(raw);
        if (!doc) fail('Не удалось разобрать файл лицензии');
        var verified = cryptoLib.verifyDocument(kp.publicKey, doc);
        if (!verified.ok) fail(verified.error || 'Подпись недействительна');
        console.log('OK: подпись верна для keypair', keypairPath);
        console.log(JSON.stringify(verified.payload, null, 2));
        return;
    }

    if (!opts.customer || !opts.machine) {
        fail('Нужны --customer и --machine (код с /license.html клиента)');
    }

    var doc = cryptoLib.createLicenseDocument(kp.privateKey, {
        customer: opts.customer,
        note: opts.note,
        machineFingerprint: opts.machine
    });
    var text = JSON.stringify(doc, null, 2);
    console.log(text);
    console.error('[license] Подписано keypair:', keypairPath);
    console.error('[license] publicKey:', kp.publicKey);
}

main();
