const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
}

const files = [
    'main.js', 'server-api.js', 'server.js', 'database.js',
    'auth.js', 'avatars.js', 'chat-media.js', 'news-media.js', 'news-sanitize.js', 'lib/security.js'
];
if (fs.existsSync('js')) walk('js', files);

let fail = 0;
for (const f of files) {
    try {
        execSync(`node --check "${f}"`, { stdio: 'pipe' });
    } catch (e) {
        fail++;
        console.error('FAIL', f);
        console.error(e.stderr ? e.stderr.toString() : e.message);
    }
}
console.log(fail ? `FAILED: ${fail}` : `OK: ${files.length} files`);
process.exit(fail ? 1 : 0);
