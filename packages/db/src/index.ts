import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const { Pool } = pg;

// How long to wait for a new database connection before failing the request. pg's default is to wait
// forever, so an unreachable database would hang requests instead of failing them. Long enough for
// Neon to wake a suspended compute (usually well under a few seconds).
export const CONNECTION_TIMEOUT_MS = 10_000;

// What's safe to log about a database error: only its Postgres or Node error code (e.g. 57P01, ECONNRESET).
// Not the message or the error object, which can quote hosts, users or connection details.
export function databaseErrorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

type PoolOptions = {
  connectionString?: string;
  connectionTimeoutMillis?: number;
};

export function createPool({
  connectionString = process.env.DATABASE_URL,
  connectionTimeoutMillis = CONNECTION_TIMEOUT_MS,
}: PoolOptions = {}) {
  const pool = new Pool({ connectionString, connectionTimeoutMillis });

  // A connection sitting idle in the pool can be closed from the other end: a network drop, Neon
  // restarting or suspending its compute. pg emits that as an 'error' event on the pool, and an
  // 'error' event with no listener crashes Node. pg has already discarded that connection and opens a
  // new one when it's next needed, so logging is all that's left to do. (Errors during a query are
  // returned to the caller as usual, not reported here.)
  pool.on('error', (error) => {
    console.error(
      `Database connection lost while idle (code ${databaseErrorCode(error)}); it will be replaced on next use.`,
    );
  });

  return pool;
}

export const pool = createPool();

export const db = drizzle(pool);

export { commands, tags, commandTags } from './schema.js';
export { users, sessions, accounts, verifications, rateLimits, deviceCodes } from './auth-schema.js';
