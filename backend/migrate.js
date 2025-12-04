#!/usr/bin/env node

/**
 * Database Migration Runner
 * Executes SQL migration files in order
 *
 * Usage:
 * pnpm run db:migrate              - Run all pending migrations
 * pnpm run db:migrate:init       - Initialize migrations tracking table
 * pnpm run db:migrate:status     - Check migration status
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load .env file
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Get environment variables
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable not set');
  console.error(
    'Make sure your .env file exists and contains DATABASE_URL=...',
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const migrationsDir = path.join(__dirname, 'src', 'database', 'migrations');

/**
 * Initialize migrations tracking table
 */
async function initMigrationsTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Migrations table initialized');
  } catch (error) {
    console.error('❌ Error initializing migrations table:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT name FROM migrations ORDER BY applied_at',
    );
    return result.rows.map((row) => row.name);
  } catch (error) {
    console.error('❌ Error fetching applied migrations:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get list of migration files
 */
function getMigrationFiles() {
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ Migrations directory not found:', migrationsDir);
    process.exit(1);
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(migrationName) {
  const client = await pool.connect();
  try {
    await client.query('INSERT INTO migrations (name) VALUES ($1)', [
      migrationName,
    ]);
  } catch (error) {
    console.error('❌ Error marking migration as applied:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run a single migration
 */
async function runMigration(migrationFile) {
  const filePath = path.join(migrationsDir, migrationFile);
  const sql = fs.readFileSync(filePath, 'utf-8');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`✅ Applied migration: ${migrationFile}`);
    await markMigrationApplied(migrationFile);
  } catch (error) {
    console.error(
      `❌ Error applying migration ${migrationFile}:`,
      error.message,
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get migration status
 */
async function getStatus() {
  const migrationFiles = getMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();

  console.log('\n📊 Migration Status:\n');
  console.log('File Name'.padEnd(40) + 'Status');
  console.log('-'.repeat(50));

  migrationFiles.forEach((file) => {
    const isApplied = appliedMigrations.includes(file);
    const status = isApplied ? '✅ Applied' : '⏳ Pending';
    console.log(file.padEnd(40) + status);
  });

  console.log();
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    // Initialize migrations table
    await initMigrationsTable();

    // Get migration files and applied migrations
    const migrationFiles = getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations();

    console.log('\n🔄 Running migrations...\n');

    // Filter pending migrations
    const pendingMigrations = migrationFiles.filter(
      (file) => !appliedMigrations.includes(file),
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ All migrations are up to date!');
      return;
    }

    // Run each pending migration
    for (const migrationFile of pendingMigrations) {
      await runMigration(migrationFile);
    }

    console.log(
      `\n✅ Successfully applied ${pendingMigrations.length} migration(s)\n`,
    );
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes('--init')) {
      await initMigrationsTable();
      console.log('✅ Migrations table initialized');
      await pool.end();
    } else if (args.includes('--status')) {
      await initMigrationsTable();
      await getStatus();
      await pool.end();
    } else {
      await runMigrations();
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
