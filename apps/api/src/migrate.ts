// Applies pending database migrations in production: `node dist/migrate.js`, run before the new server starts.
// Uses drizzle-orm's migrator (drizzle-kit is a dev dependency and isn't deployed) and the same history table
// as `pnpm db:migrate`, so databases migrated either way agree on what has been applied.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// The build copies packages/db/drizzle here, so the SQL files ship with the compiled code.
const migrationsFolder = fileURLToPath(new URL('./migrations/', import.meta.url));

// Any fixed number works; it just has to be the same for every run of this script.
const MIGRATION_LOCK_ID = 726_100_001;

// A migration that has to wait longer than this for a table lock fails instead of queueing behind
// live traffic, and blocking every request to that table while it waits.
const LOCK_TIMEOUT = '10s';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }

  if (!existsSync(`${migrationsFolder}meta/_journal.json`)) {
    throw new Error(`No migrations found in ${migrationsFolder}. Run pnpm build first.`);
  }

  // One connection, so the lock and settings below apply to every migration statement.
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'dev-library-migrate' });
  await client.connect();

  try {
    // Logged without the password, so it's clear which database is being changed.
    const { rows } = await client.query<{ database: string }>('select current_database() as database');
    console.log(`Migrating database "${rows[0].database}" on ${new URL(databaseUrl).hostname}`);

    await client.query(`set lock_timeout = '${LOCK_TIMEOUT}'`);
    // If two deploys overlap, the second waits here (up to the lock timeout) rather than migrating at the same time.
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    // Applies every pending migration in one transaction: all of them succeed, or none are applied.
    await migrate(drizzle(client), { migrationsFolder });

    console.log('Migrations are up to date');
  } finally {
    // Closing the connection also releases the advisory lock.
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
