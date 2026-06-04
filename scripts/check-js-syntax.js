const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function walk(dir, out) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
}

const files = [
    path.join(ROOT, 'public', 'js', 'app', 'main.js'),
    path.join(ROOT, 'public', 'js', 'app', 'auth.js'),
    path.join(ROOT, 'server', 'server-api.js'),
    path.join(ROOT, 'server', 'server.js'),
    path.join(ROOT, 'server', 'database.js'),
    path.join(ROOT, 'server', 'avatars.js'),
    path.join(ROOT, 'server', 'chat-media.js'),
    path.join(ROOT, 'server', 'news-media.js'),
    path.join(ROOT, 'server', 'news-sanitize.js'),
    path.join(ROOT, 'server', 'lib', 'security.js')
];
walk(path.join(ROOT, 'public', 'js'), files);
walk(path.join(ROOT, 'server', 'lib'), files);

let fail = 0;
for (const f of files) {
    try {
        execSync(`node --check "${f}"`, { stdio: 'pipe' });
    } catch (e) {
        fail++;
        console.error('FAIL', path.relative(ROOT, f));
        console.error(e.stderr ? e.stderr.toString() : e.message);
    }
}
console.log(fail ? `FAILED: ${fail}` : `OK: ${files.length} files`);
process.exit(fail ? 1 : 0);
