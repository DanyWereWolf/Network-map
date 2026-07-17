'use strict';

/**
 * Patch server-config.json for MySQL storage from env vars.
 * Used by scripts/setup-mysql-linux.sh
 *
 * Env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'server-config.json');
const EXAMPLE = path.join(ROOT, 'server', 'config', 'server-config.example.json');

function loadJson(p) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
    var cfg;
    if (fs.existsSync(CONFIG)) {
        cfg = loadJson(CONFIG);
    } else if (fs.existsSync(EXAMPLE)) {
        cfg = loadJson(EXAMPLE);
    } else {
        cfg = {};
    }

    cfg.storage = 'mysql';
    cfg.mysql = Object.assign({}, cfg.mysql || {}, {
        host: process.env.MYSQL_HOST || (cfg.mysql && cfg.mysql.host) || '127.0.0.1',
        port: parseInt(process.env.MYSQL_PORT || (cfg.mysql && cfg.mysql.port) || '3306', 10),
        user: process.env.MYSQL_USER || (cfg.mysql && cfg.mysql.user) || 'networkmap',
        password: process.env.MYSQL_PASSWORD != null
            ? process.env.MYSQL_PASSWORD
            : (cfg.mysql && cfg.mysql.password != null ? cfg.mysql.password : ''),
        database: process.env.MYSQL_DATABASE || (cfg.mysql && cfg.mysql.database) || 'network_map',
        connectionLimit: (cfg.mysql && cfg.mysql.connectionLimit) || 10
    });

    fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    console.log('[configure-mysql] Updated', CONFIG);
    console.log('[configure-mysql] storage=mysql database=' + cfg.mysql.database + ' user=' + cfg.mysql.user);
}

main();
