'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT_DIR = path.join(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'server-config.json');

let pool = null;
let cachedConfig = null;

function loadServerConfig() {
    if (cachedConfig) return cachedConfig;
    try {
        cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        cachedConfig = {};
    }
    return cachedConfig;
}

function getMysqlConfig() {
    const cfg = loadServerConfig();
    const m = cfg.mysql || {};
    return {
        host: process.env.MYSQL_HOST || m.host || '127.0.0.1',
        port: parseInt(process.env.MYSQL_PORT || m.port || '3306', 10),
        user: process.env.MYSQL_USER || m.user || 'root',
        password: process.env.MYSQL_PASSWORD != null ? process.env.MYSQL_PASSWORD : (m.password || ''),
        database: process.env.MYSQL_DATABASE || m.database || 'network_map',
        waitForConnections: true,
        connectionLimit: parseInt(process.env.MYSQL_POOL || m.connectionLimit || '10', 10),
        charset: 'utf8mb4',
        timezone: 'Z',
        multipleStatements: true
    };
}

function isMysqlEnabled() {
    const cfg = loadServerConfig();
    const storage = process.env.STORAGE || cfg.storage || 'json';
    return String(storage).toLowerCase() === 'mysql';
}

async function getPool() {
    if (pool) return pool;
    const conf = getMysqlConfig();
    // Ensure database exists
    const { database, ...serverConf } = conf;
    const boot = await mysql.createConnection(serverConf);
    try {
        await boot.query(
            'CREATE DATABASE IF NOT EXISTS `' + database.replace(/`/g, '') +
            '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
        );
    } finally {
        await boot.end();
    }
    pool = mysql.createPool(conf);
    return pool;
}

async function query(sql, params) {
    const p = await getPool();
    return p.query(sql, params);
}

async function withTransaction(fn) {
    const p = await getPool();
    const conn = await p.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (e) {
        try { await conn.rollback(); } catch (_) {}
        throw e;
    } finally {
        conn.release();
    }
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

function resetConfigCache() {
    cachedConfig = null;
}

module.exports = {
    loadServerConfig,
    getMysqlConfig,
    isMysqlEnabled,
    getPool,
    query,
    withTransaction,
    closePool,
    resetConfigCache
};
