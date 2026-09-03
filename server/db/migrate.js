'use strict';

/**
 * Apply server/db/schema.sql and incremental migrations; record in schema_migrations.
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

async function hasMigration(id) {
    const [rows] = await query('SELECT id FROM schema_migrations WHERE id = ?', [id]);
    return !!(rows && rows.length);
}

async function markMigration(id) {
    await query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [id]);
}

async function applyInitialSchema() {
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    console.log('[MySQL] Applying schema to', getMysqlConfig().database, '…');
    await query(sql);
}

async function columnExists(table, column) {
    const [rows] = await query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return !!(rows && rows.length);
}

async function applyEmailVerificationMigration() {
    if (!(await columnExists('users', 'email_verified'))) {
        await query('ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 1 AFTER email');
    }
    await query(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          token VARCHAR(128) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          expires_at DATETIME(3) NOT NULL,
          payload_json JSON NULL,
          INDEX idx_evt_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function runMigrations() {
    await getPool();
    await ensureMigrationsTable();
    var applied = [];

    if (!(await hasMigration(MIGRATION_ID))) {
        await applyInitialSchema();
        await markMigration(MIGRATION_ID);
        applied.push(MIGRATION_ID);
        console.log('[MySQL] Migration applied:', MIGRATION_ID);
    } else {
        console.log('[MySQL] Migrations up to date (' + MIGRATION_ID + ')');
    }

    var emailMig = '002_email_verification';
    if (!(await hasMigration(emailMig))) {
        await applyEmailVerificationMigration();
        await markMigration(emailMig);
        applied.push(emailMig);
        console.log('[MySQL] Migration applied:', emailMig);
    }

    var embedMig = '003_org_embed';
    if (!(await hasMigration(embedMig))) {
        if (!(await columnExists('organizations', 'embed_enabled'))) {
            await query('ALTER TABLE organizations ADD COLUMN embed_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER two_factor_secret');
        }
        if (!(await columnExists('organizations', 'embed_token'))) {
            await query('ALTER TABLE organizations ADD COLUMN embed_token VARCHAR(128) NULL AFTER embed_enabled');
        }
        if (!(await columnExists('organizations', 'embed_created_at'))) {
            await query('ALTER TABLE organizations ADD COLUMN embed_created_at DATETIME(3) NULL AFTER embed_token');
        }
        await markMigration(embedMig);
        applied.push(embedMig);
        console.log('[MySQL] Migration applied:', embedMig);
    }

    var zabbixMig = '004_org_zabbix';
    if (!(await hasMigration(zabbixMig))) {
        if (!(await columnExists('organizations', 'zabbix_enabled'))) {
            await query('ALTER TABLE organizations ADD COLUMN zabbix_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER embed_created_at');
        }
        if (!(await columnExists('organizations', 'zabbix_api_url'))) {
            await query('ALTER TABLE organizations ADD COLUMN zabbix_api_url VARCHAR(512) NULL AFTER zabbix_enabled');
        }
        if (!(await columnExists('organizations', 'zabbix_api_token'))) {
            await query('ALTER TABLE organizations ADD COLUMN zabbix_api_token VARCHAR(512) NULL AFTER zabbix_api_url');
        }
        if (!(await columnExists('organizations', 'zabbix_updated_at'))) {
            await query('ALTER TABLE organizations ADD COLUMN zabbix_updated_at DATETIME(3) NULL AFTER zabbix_api_token');
        }
        await markMigration(zabbixMig);
        applied.push(zabbixMig);
        console.log('[MySQL] Migration applied:', zabbixMig);
    }

    return { applied: applied.length > 0, ids: applied.length ? applied : [MIGRATION_ID, emailMig, embedMig, zabbixMig] };
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
