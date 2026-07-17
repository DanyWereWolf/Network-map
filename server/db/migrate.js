'use strict';

/**
 * Apply server/db/schema.sql and record in schema_migrations.
 */
const fs = require('fs');
const path = require('path');
const { getPool, query, getMysqlConfig } = require('./mysql');

const MIGRATION_ID = '001_initial_schema';
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

async function ensureMigrationsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id VARCHAR(64) PRIMARY KEY,
          applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function runMigrations() {
    await getPool();
    await ensureMigrationsTable();
    const [rows] = await query('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
    if (rows && rows.length) {
        console.log('[MySQL] Migrations up to date (' + MIGRATION_ID + ')');
        return { applied: false, id: MIGRATION_ID };
    }
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    console.log('[MySQL] Applying schema to', getMysqlConfig().database, '…');
    await query(sql);
    await query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('[MySQL] Migration applied:', MIGRATION_ID);
    return { applied: true, id: MIGRATION_ID };
}

if (require.main === module) {
    runMigrations()
        .then(function (r) {
            console.log(JSON.stringify(r));
            process.exit(0);
        })
        .catch(function (e) {
            console.error('[MySQL] Migration failed:', e.message);
            process.exit(1);
        });
}

module.exports = { runMigrations, MIGRATION_ID };
