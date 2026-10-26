import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { testDatabaseUrl } from './test-database.js';

// Runs once before all tests: creates the test database if needed and applies every migration.
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);

  // CREATE DATABASE has to run while connected to a different database.
  const serverUrl = new URL(url);
  serverUrl.pathname = '/postgres';
  const server = new pg.Client({ connectionString: serverUrl.toString() });
  await server.connect();

  try {
    const { rowCount } = await server.query('select 1 from pg_database where datname = $1', [name]);

    if (rowCount === 0) {
      // The name is checked in testDatabaseUrl, so it's safe to put in the SQL.
      await server.query(`create database "${name}"`);
    }
  } finally {
    await server.end();
  }

  const pool = new pg.Pool({ connectionString: url.toString() });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../../../packages/db/drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
