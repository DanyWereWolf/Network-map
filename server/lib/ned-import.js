/**
 * Конвертация проекта NeD (.ned) → JSON-массив Network-map
 * через tools/ned-import/NedToNetworkMap (.NET).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PROJECT_DIR = path.join(ROOT_DIR, 'tools', 'ned-import', 'NedToNetworkMap');
const DLL_PATH = path.join(PROJECT_DIR, 'bin', 'Release', 'net10.0', 'NedToNetworkMap.dll');

function converterAvailable() {
    return fs.existsSync(DLL_PATH) || fs.existsSync(path.join(PROJECT_DIR, 'NedToNetworkMap.csproj'));
}

/**
 * @param {Buffer} nedBuffer
 * @returns {Promise<object[]>}
 */
function convertNedBuffer(nedBuffer) {
    return new Promise(function(resolve, reject) {
        if (!Buffer.isBuffer(nedBuffer) || nedBuffer.length < 48) {
            reject(new Error('Пустой или повреждённый .ned файл'));
            return;
        }
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ned-import-'));
        const nedPath = path.join(tmpDir, 'project.ned');
        const outPath = path.join(tmpDir, 'map.json');
        fs.writeFileSync(nedPath, nedBuffer);

        const useDll = fs.existsSync(DLL_PATH);
        const args = useDll
            ? [DLL_PATH, nedPath, outPath]
            : ['run', '--project', PROJECT_DIR, '-c', 'Release', '--', nedPath, outPath];

        const child = spawn('dotnet', args, {
            cwd: ROOT_DIR,
            windowsHide: true,
            env: process.env
        });

        let stderr = '';
        let stdout = '';
        child.stdout.on('data', function(d) { stdout += d.toString(); });
        child.stderr.on('data', function(d) { stderr += d.toString(); });
        child.on('error', function(err) {
            cleanup(tmpDir);
            reject(new Error('Не удалось запустить dotnet: ' + err.message));
        });
        child.on('close', function(code) {
            try {
                if (code !== 0) {
                    cleanup(tmpDir);
                    reject(new Error(
                        'Конвертер NeD завершился с кодом ' + code +
                        (stderr || stdout ? ': ' + (stderr || stdout).slice(0, 500) : '')
                    ));
                    return;
                }
                if (!fs.existsSync(outPath)) {
                    cleanup(tmpDir);
                    reject(new Error('Конвертер не создал JSON'));
                    return;
                }
                const text = fs.readFileSync(outPath, 'utf8');
                const data = JSON.parse(text);
                cleanup(tmpDir);
                if (!Array.isArray(data)) {
                    reject(new Error('Конвертер вернул не массив'));
                    return;
                }
                resolve(data);
            } catch (e) {
                cleanup(tmpDir);
                reject(e);
            }
        });
    });
}

function cleanup(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
}

module.exports = {
    converterAvailable: converterAvailable,
    convertNedBuffer: convertNedBuffer
};
